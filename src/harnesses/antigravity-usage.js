'use strict';
// THE ANTIGRAVITY /usage READING — the judge (lane antigravity-harness, commit 3) and, since a SIGNED-IN capture exists,
// the parser (lane antigravity-card-fixes). PURE: imports only src/quota-model.js (itself PURE).
// agy's release notes (1.4.3, the binary's own `agy changelog`): `-p "/usage"`, `/quota`, `/credits` … "emit one
// tab-separated record per line — or a structured payload under --output-format json and stream-json — without starting
// an agent turn, spending quota, or leaving a conversation behind". The PAYLOAD'S SHAPE is not in the docs (the /usage
// page shows the TUI panel only) and cannot be read offline (the binary holds the RPC names RetrieveUserQuota /
// FetchQuotaStatus, not the print format) — so commit 3 shipped NO parser: every SUCCESS answer was 'unparsed' (kept
// for the capture), never guessed into a reading. A SUCCESS in a shape `KNOWN_SHAPES` pins (below) is a 'reading';
// any other stays 'unparsed'. The judge's other verdicts:
//   · 'turn-started' — THE BRIEF'S STOP RULE ("prove it sends no prompt; if it bills, STOP"): an answer whose envelope
//     shows a conversation, a turn or a token (num_turns > 0, any usage counter > 0, a conversation_id) is the vendor's
//     claim refuted — the reading door must stay shut;
//   · 'auth-required' — the measured unauthenticated answer (result ERROR "authentication failed or timed out", stderr
//     "authentication required"); 'error' — another ERROR envelope; 'no-answer' — nothing parseable on stdout.
// scripts/agy-usage-capture.mjs runs the exact command once, by hand, on a signed-in login and writes the redacted
// answer as scripts/fixtures/antigravity-usage-<version>.json — the parser, the click-gated door and pool membership
// are built on THAT (a signed-in capture), never on a guess.
//
// THE CAPTURE (2026-10-20 17:42Z, agy 1.4.3, a signed-in Personal Ultra account on its HOME root — scripts/fixtures/
// antigravity-usage-1.4.3.json): a SUCCESS envelope with no turn (num_turns 0, every token counter 0, no
// conversation_id) whose `command` is `{ name: 'usage', data: { description, groups: [{ name, description, buckets:
// [{ id, name, window: 'weekly' | '5h', remaining_fraction: 0..1, reset_time: ISO-8601 }] }] } }` — two groups (the
// Gemini models; the Claude and GPT models), each sharing a weekly and a five-hour limit — and the same rows as
// tab-separated text in `response`. `usage-groups` reads the structured half; ANY field it does not find exactly as
// captured (another window code, a fraction outside 0..1, a reset that is not a date, a group with no bucket …)
// leaves the answer 'unparsed' — kept, never guessed.
const QM = require('../quota-model.js');

/** The reading command (the CLI answers it itself; stdin must be a closed PIPE — a character device makes an
 *  unauthenticated agy wait 60 s for a pasted code, measured). */
const USAGE_ARGV = Object.freeze(['-p', '/usage', '--output-format', 'json']);
/** The reading's provenance on every limit it writes (the brief's word: a CLI's own usage command). */
const USAGE_SOURCE = 'cli-usage';
/** agy's window codes → the typed model's window kinds (the only two the capture shows). */
const WINDOW_KINDS = Object.freeze({ '5h': '5h', weekly: '7d' });
const isStr = (v) => typeof v === 'string' && v.length > 0;

/** `usage-groups` (agy 1.4.3): the envelope → a typed LimitSet (src/quota-model.js) — one limit per group (scope
 *  'model': the group's models share it), one window per bucket (usedPct = 100 × (1 − remaining_fraction), resetsAt =
 *  reset_time), source 'cli-usage'; agy's own names ride `extra.windowNames` ("<group>/<kind>" → the bucket's name) so
 *  the card says them as agy does. null = not this shape (the judge then says 'unparsed'). */
function readingOfUsageGroups(env, { measuredAt = null } = {}) {
  const cmd = env && typeof env.command === 'object' && env.command ? env.command : null;
  if (!cmd || cmd.name !== 'usage' || !cmd.data || typeof cmd.data !== 'object' || !Array.isArray(cmd.data.groups) || !cmd.data.groups.length) return null;
  const at = Number(measuredAt) > 0 ? Number(measuredAt) : null;
  const limits = [], windowNames = {}, seen = new Set();
  for (const g of cmd.data.groups) {
    if (!g || !isStr(g.name) || seen.has(g.name) || !Array.isArray(g.buckets) || !g.buckets.length) return null;
    seen.add(g.name);
    const windows = [], kinds = new Set();
    for (const b of g.buckets) {
      if (!b || !isStr(b.id) || !isStr(b.name)) return null;
      const kind = Object.prototype.hasOwnProperty.call(WINDOW_KINDS, b.window) ? WINDOW_KINDS[b.window] : null;
      const rf = b.remaining_fraction;
      const reset = isStr(b.reset_time) ? Date.parse(b.reset_time) : NaN;
      if (!kind || kinds.has(kind) || typeof rf !== 'number' || !Number.isFinite(rf) || rf < 0 || rf > 1 || !Number.isFinite(reset) || reset <= 0) return null;
      kinds.add(kind);
      windows.push(QM.makeWindow({ kind, usedPct: Math.round((1 - rf) * 10000) / 100, resetsAt: Math.floor(reset / 1000), measuredAt: at }));
      windowNames[`${g.name}/${kind}`] = b.name;
    }
    limits.push(QM.makeLimit({ limitId: g.name, name: g.name, scope: 'model', windows, source: USAGE_SOURCE, fetchedAt: at }));
  }
  const set = QM.makeLimitSet({ fetchedAt: at, source: USAGE_SOURCE, limits, extra: { windowNames } });
  return QM.validateLimitSet(set).ok ? set : null;
}
/** Payload shapes a signed-in capture has pinned. Each: { id, version, match(env, opts) → reading | null }. */
const KNOWN_SHAPES = Object.freeze([Object.freeze({ id: 'usage-groups', version: '1.4.3', match: readingOfUsageGroups })]);
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
function judgeUsageAnswer({ code = null, stdout = '', stderr = '', measuredAt = null } = {}) {
  const env = envelopeOf(stdout);
  const signs = turnSigns(env);
  if (signs.length) return { verdict: 'turn-started', why: `the answer shows a turn (${signs.join(', ')}) — agy's "without starting an agent turn" is refuted here: the reading door stays shut`, envelope: env };
  const err = env && typeof env.error === 'string' ? env.error : '';
  const status = env && typeof env.status === 'string' ? env.status : null;
  if (AUTH_RE.test(err) || AUTH_RE.test(String(stderr || ''))) return { verdict: 'auth-required', why: 'this login is not signed in (agy refused before reading anything)', envelope: env };
  if (!env) return { verdict: 'no-answer', why: `nothing parseable on stdout (exit ${code})`, envelope: null };
  if (status && status !== 'SUCCESS') return { verdict: 'error', why: `agy answered ${status}${err ? ': ' + err.slice(0, 200) : ''}`, envelope: env };
  for (const sh of KNOWN_SHAPES) { const reading = sh.match(env, { measuredAt }); if (reading) return { verdict: 'reading', shape: sh.id, reading, envelope: env }; }
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

module.exports = { USAGE_ARGV, USAGE_SOURCE, WINDOW_KINDS, KNOWN_SHAPES, readingOfUsageGroups, envelopeOf, turnSigns, judgeUsageAnswer, redactCapture };
