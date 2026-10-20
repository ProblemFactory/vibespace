'use strict';
// THE ANTIGRAVITY /usage READING — the judge (lane antigravity-harness, commit 3). PURE: imports nothing.
// agy's release notes (1.4.3, the binary's own `agy changelog`): `-p "/usage"`, `/quota`, `/credits` … "emit one
// tab-separated record per line — or a structured payload under --output-format json and stream-json — without starting
// an agent turn, spending quota, or leaving a conversation behind". The PAYLOAD'S SHAPE is not in the docs (the /usage
// page shows the TUI panel only) and cannot be read offline (the binary holds the RPC names RetrieveUserQuota /
// FetchQuotaStatus, not the print format) — so there is NO parser here yet: `KNOWN_SHAPES` is empty and every SUCCESS
// answer is judged 'unparsed' (kept for the capture), never guessed into a reading. What IS judged now:
//   · 'turn-started' — THE BRIEF'S STOP RULE ("prove it sends no prompt; if it bills, STOP"): an answer whose envelope
//     shows a conversation, a turn or a token (num_turns > 0, any usage counter > 0, a conversation_id) is the vendor's
//     claim refuted — the reading door must stay shut;
//   · 'auth-required' — the measured unauthenticated answer (result ERROR "authentication failed or timed out", stderr
//     "authentication required"); 'error' — another ERROR envelope; 'no-answer' — nothing parseable on stdout.
// scripts/agy-usage-capture.mjs runs the exact command once, by hand, on a signed-in login and writes the redacted
// answer as scripts/fixtures/antigravity-usage-<version>.json — the parser, the click-gated door and pool membership
// are built on THAT (a signed-in capture), never on a guess.

/** The reading command (the CLI answers it itself; stdin must be a closed PIPE — a character device makes an
 *  unauthenticated agy wait 60 s for a pasted code, measured). */
const USAGE_ARGV = Object.freeze(['-p', '/usage', '--output-format', 'json']);
/** Payload shapes a signed-in capture has pinned (none yet). Each: { id, version, match(env) → reading | null }. */
const KNOWN_SHAPES = Object.freeze([]);
const AUTH_RE = /authentication (required|failed)|not logged in|please sign in/i;

/** The JSON envelope agy prints with --output-format json (the LAST parseable top-level object on stdout). */
function envelopeOf(stdout) {
  const s = String(stdout || '').trim();
  if (!s) return null;
  try { const j = JSON.parse(s); return j && typeof j === 'object' ? j : null; } catch { /* a multi-line answer: try the last line */ }
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) { try { const j = JSON.parse(lines[i]); if (j && typeof j === 'object') return j; } catch { } }
  return null;
}
/** Did this answer start a turn? Any sign of one counts (the claim under test is "no turn, no quota, no conversation"). */
function turnSigns(env) {
  const r = env && typeof env.result === 'object' && env.result ? env.result : env; // json = the envelope; stream-json = {event:'result', result}
  if (!r || typeof r !== 'object') return [];
  const signs = [];
  if (Number(r.num_turns) > 0) signs.push(`num_turns ${r.num_turns}`);
  if (typeof r.conversation_id === 'string' && r.conversation_id) signs.push('a conversation_id');
  const u = r.usage && typeof r.usage === 'object' ? r.usage : {};
  for (const [k, v] of Object.entries(u)) if (Number(v) > 0) signs.push(`usage.${k} ${v}`);
  return signs;
}
/** Judge one `agy -p /usage --output-format json` answer. */
function judgeUsageAnswer({ code = null, stdout = '', stderr = '' } = {}) {
  const env = envelopeOf(stdout);
  const signs = turnSigns(env);
  if (signs.length) return { verdict: 'turn-started', why: `the answer shows a turn (${signs.join(', ')}) — agy's "without starting an agent turn" is refuted here: the reading door stays shut`, envelope: env };
  const err = env && typeof env.error === 'string' ? env.error : '';
  const status = env && typeof env.status === 'string' ? env.status : null;
  if (AUTH_RE.test(err) || AUTH_RE.test(String(stderr || ''))) return { verdict: 'auth-required', why: 'this login is not signed in (agy refused before reading anything)', envelope: env };
  if (!env) return { verdict: 'no-answer', why: `nothing parseable on stdout (exit ${code})`, envelope: null };
  if (status && status !== 'SUCCESS') return { verdict: 'error', why: `agy answered ${status}${err ? ': ' + err.slice(0, 200) : ''}`, envelope: env };
  for (const sh of KNOWN_SHAPES) { const reading = sh.match(env); if (reading) return { verdict: 'reading', shape: sh.id, reading, envelope: env }; }
  return { verdict: 'unparsed', why: 'agy answered without a turn, in a shape no signed-in capture has pinned yet — kept for the capture, never guessed', envelope: env };
}
/** A capture safe to commit: e-mail addresses, Google project ids and long opaque tokens become placeholders. */
function redactCapture(value) {
  const red = (s) => String(s)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/\b(projects\/)?[a-z][a-z0-9-]{4,28}[a-z0-9]-\d{3,}\b/g, '<project>')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '<opaque>');
  const walk = (v) => (typeof v === 'string' ? red(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  return walk(value);
}

module.exports = { USAGE_ARGV, KNOWN_SHAPES, envelopeOf, turnSigns, judgeUsageAnswer, redactCapture };
