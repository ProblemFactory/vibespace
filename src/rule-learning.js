'use strict';
/**
 * RULE LEARNING (lane rule-learning — design q-037 P0, owner 2026-10-14) — PURE, CJS, bundled by the server and the
 * client alike. It imports only the decision model (THE ONE scrub `cleanPart`, `estTokens`, the RUBRIC's words).
 * The 「我关心什么」 block DRAFTED by a text model from the owner's verdicts — PROPOSED, never written:
 *  · `availability({integrationRow, pluginOn})` — the feature EXISTS only on the Decision API row with provider
 *    `openrouter` and a key (the user's own or the cluster's) while the plugin is on; otherwise the button and the route
 *    do not exist (the route answers 404 by name) — never a grey control;
 *  · `buildLearnInput({block, examples, rubricHits})` — FIXED first (the task and the answer's rules), VARIABLE last (the
 *    block numbered line by line, then ≤ 60 examples: the person's own labels first, the implicit ones marked
 *    `inferred`, each the ≤ 200-character digest the judge already saw, cleaned again by cleanPart), ≤ 4 000 tokens by
 *    estTokens with the schema counted — over it the inferred examples leave first, then the oldest own ones. The input
 *    holds ONLY what the judge already saw (invariant E): the examples' digests and the block, never a message body;
 *  · `LEARN_SCHEMA` — the strict JSON the model answers: {lines: [{text, kind: keep|edit|add, line, from: [example #…],
 *    evidence}], removed: [{line, reason}], note} — `line` = the block line a keep / an edit comes from (null for add);
 *  · `normalizeProposal(raw, {block, examples, shown})` — THE SIX RULES: ① ≤ 12 lines; ② every string the model wrote
 *    goes through the ONE scrub (cleanPart: secrets redacted, addresses cut to their domain, frames inert) and is bounded
 *    — an edit or a new line over 120 characters (counted in characters, CJK one each) is CUT for its box at a word
 *    boundary (CJK: at the character), NEVER with an elision marker, marked `long` and NEVER pre-ticked: the card says
 *    「太长——已截短」 and keeps the model's whole text (scrubbed) under the row's 技术细节 fold (lane rule-learning-fix-r2
 *    F4: cleanPart's `…[n characters omitted]…` rode a pre-ticked box into the saved block);
 *    ③ an example number outside the input is dropped; ④ an edit or a new line with no valid example number is
 *    `unsupported` — shown with 「无依据」, never pre-ticked (a keep is the person's own line, word for word: it needs no
 *    example); ⑤ an empty or a duplicate line is dropped; ⑥ a keep / an edit / a removal names an EXISTING block line,
 *    each block line claimed once (else a keep / an edit becomes a new line, a removal is dropped). A KEEP with a valid
 *    line number IS that block line, verbatim, whatever the model wrote — the 120-character bound is for an edit and a
 *    new line only (lane rule-learning-fix F2: a kept line over 120 was cut, compared unequal, demoted to an unticked
 *    edit, and Save dropped it — a one-line block was erased);
 *  · `diffTable(block, proposal)` — the card's rows: the proposed lines in order (keep / edit / add, evidence, tick), then
 *    the block lines that leave (a named removal with its reason, unticked; a line the answer never mentioned, ticked —
 *    it stays unless the person unticks it). ONE rule for every rewording (lane learn-card-untick, verify r3 R3-F1): the
 *    line an edit rewords keeps a row of its own, its tick the opposite of the rewording's — `replaced` (unticked) under a
 *    pre-ticked rewording, `unproven` (no evidence) / `shortened` (cut) (ticked) under one that is not; the rewording
 *    ticked ⇒ it replaces the line, unticked ⇒ the person's line is kept (a keep alone claims its line: it IS that line —
 *    the old rule let a pre-ticked rewording claim it, and unticking it dropped the line unsaid); `blockFrom(table)` = the
 *    text Save writes through the settings door, WHOLE — never cut (lane rule-learning-fix F3): `blockFit(text)` counts
 *    it against the block's 1 500 characters and the card waits while over. The table is built on the STORED block, whole
 *    (`stored` = its own length: a block already over 1 500 is said, its tail kept — lane rule-learning-fix-r2 F6); the
 *    model was shown only the judge's read of it (the first 1 500 — `shown` = its line count);
 *  · `weeklySummary(examples, sinceAt)` — the P1 digest's counts and words (its trigger is P1 and OFF: no timer anywhere);
 *  · `MODELS` / `modelOf` / `learnCost` — the two tiers (Gemini 3.8 Flash, the default; Sonnet 5.5, the quality tier —
 *    both through OpenRouter's zero-data-retention routing, never an Anthropic endpoint) and their prices.
 * No I/O, no clock.
 */
const M = require('./decision-model.js');

// OpenRouter model ids + USD per million tokens (or-models.json of the design, measured 2026-10-14)
const MODELS = Object.freeze({
  flash: Object.freeze({ key: 'flash', id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash', inPerMtok: 0.75, outPerMtok: 3.75 }),
  sonnet: Object.freeze({ key: 'sonnet', id: 'anthropic/claude-sonnet-5.5', label: 'Sonnet 5.5', inPerMtok: 2, outPerMtok: 10 }),
});
const DEFAULT_TIER = 'flash';
const LEARN = Object.freeze({
  inputMax: 4000,        // tokens a call sends at most (estTokens: the task + the schema + the block + the examples)
  outputMax: 1500,       // the answer's max_tokens — and the output half of the reservation
  examplesMax: 60,
  linesMax: 12,
  textMax: 120, evidenceMax: 120, reasonMax: 120, noteMax: 300, lineMax: 300,
  fullMax: 600,          // an over-long edit / new line's whole text under its row's 技术细节 fold (scrubbed; its box holds ≤ 120)
  dailyCapCents: 10,     // the use `learn`'s own cap a day, INSIDE the plugin's daily budget (≈ 14 Flash drafts)
  weeklyMin: 5,          // P1: the weekly digest calls only after ≥ 5 new judgments (the trigger is OFF in P0)
  timeoutMs: 30000,
});
const KINDS = Object.freeze(['keep', 'edit', 'add']);
const USE_CAP_CENTS = Object.freeze({ learn: LEARN.dailyCapCents });
const CLAUSE_WORD = new Map(M.RUBRIC.clauses.map((c) => [c.name, c.word]));

const str = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const fold = (s) => str(s).toLowerCase().replace(/\s+/g, ' ').trim();
/** A string the MODEL wrote, on its way to the card: the ONE scrub, one line, bounded. */
const clean = (s, max) => (typeof s === 'string' ? M.cleanPart(s, max, 'line').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The tier of the setting `plugin.decision-api.learnModel` (flash | sonnet; an OpenRouter id is accepted too). */
const modelOf = (v) => (typeof v === 'string' && Object.hasOwn(MODELS, v) ? MODELS[v] : null) || Object.values(MODELS).find((m) => m.id === v) || MODELS[DEFAULT_TIER];   // own keys only (lane rule-learning-fix L1)
/** USD of one call: input × the input price + output × the output price (1e-8 steps). */
function learnCost(model, tokensIn = 0, tokensOut = 0) {
  const m = modelOf(model);
  const usd = ((Math.max(0, Number(tokensIn) || 0) * m.inPerMtok) + (Math.max(0, Number(tokensOut) || 0) * m.outPerMtok)) / 1e6;
  return Math.round(usd * 1e8) / 1e8;
}

/** Does the feature EXIST? → {exists, why: null | 'not-openrouter' | 'no-key' | 'plugin-off'}. `integrationRow` = the
 *  registry's answer for the Decision API row ({values: {provider, apiKey}, source}). */
function availability({ integrationRow = null, pluginOn = true } = {}) {
  const v = (integrationRow && integrationRow.values) || {};
  const provider = str(v.provider).trim().toLowerCase();
  if (provider !== 'openrouter') return { exists: false, why: provider ? 'not-openrouter' : 'no-key' };
  if (!str(v.apiKey).trim()) return { exists: false, why: 'no-key' };
  if (!pluginOn) return { exists: false, why: 'plugin-off' };
  return { exists: true, why: null, source: (integrationRow && integrationRow.source) || null };
}

/** The block's lines as the person wrote them (trimmed, empty lines out) — numbered 1…n in the input and the card. The
 *  WHOLE text (lane rule-learning-fix-r2 F6): the input slices it to the judge's read first, the card's table never does. */
const blockLines = (block) => str(block).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
// THE CUT of an over-long edit / new line (F4): characters are code points (a surrogate pair is one, never split); a
// spaced script backs up to its last space when that keeps at least half the bound; CJK (and one long word) cut at the
// character. No marker: the chip says it was cut, the fold holds the whole text.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;
const ELIDED = /\s*…\[\d+ characters omitted\]…/;
const charsOf = (s) => Array.from(str(s)).length;
function cutLine(s, max) {
  const cs = Array.from(str(s));
  if (cs.length <= max) return cs.join('');
  let end = max;
  if (!/\s/.test(cs[max]) && !CJK.test(cs[max - 1]) && !CJK.test(cs[max])) {
    let i = max - 1;
    while (i > 0 && !/\s/.test(cs[i])) i--;
    if (i >= max / 2) end = i;
  }
  return cs.slice(0, end).join('').replace(/[\s,;:、，；：]+$/u, '');
}

const LEARN_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, required: ['lines', 'removed', 'note'],
  properties: {
    lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'kind', 'line', 'from', 'evidence'], properties: {
      text: { type: 'string', maxLength: LEARN.textMax }, kind: { type: 'string', enum: KINDS.slice() }, line: { type: ['integer', 'null'] },
      from: { type: 'array', items: { type: 'integer' } }, evidence: { type: 'string' } } } },
    removed: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['line', 'reason'], properties: { line: { type: 'integer' }, reason: { type: 'string' } } } },
    note: { type: 'string' },
  },
});

// THE TASK (fixed, first — the model's words, never the person's: English, like every judge instruction)
const TASK = [
  'You help a person keep a short list of what matters to them — their "what matters to me" block. A triage judge reads that block beside every incoming message and decides whether the message needs the person now.',
  'Below: the block, numbered line by line, then examples the judge already saw — each the person\'s verdict on one message: "needs" (it needed them now) or "not" (it did not). Examples marked "inferred" were read off what the person did, not from their own answer: weigh them less.',
  'Propose the block again as at most 12 lines, one criterion per line, each at most 120 characters, in the language the block is written in (an empty block: the language of the examples).',
  'For every line: "kind" = "keep" (a block line kept word for word), "edit" (a block line reworded) or "add" (a new line); "line" = the number of the block line it keeps or edits (null for "add"); "from" = the numbers of the examples it rests on (only numbers listed below); "evidence" = one short phrase saying why.',
  'Every block line you would drop goes in "removed" with its number and a short reason. Never invent what the examples do not show, and never copy an address, a number or a code out of an example. A line no example supports may stay only as "keep".',
  '"note" = at most one sentence for the person, or "". Answer with the JSON object only.',
].join('\n');

function exampleLine(x, n) {
  const words = (Array.isArray(x.hits) ? x.hits : []).map((c) => CLAUSE_WORD.get(c)).filter(Boolean);
  return `#${n} ${x.verdict === 'needs' ? 'needs' : 'not'}${x.inferred ? ' (inferred)' : ''} · ${x.digest}${words.length ? ` · the judge saw: ${words.join(', ')}` : ''}`;
}
/** THE INPUT — `examples` = `M.examplesForInput`'s shape ({snippet, verdict, inferred?}, the person's own first) and
 *  `rubricHits[i]` = the rubric clause names the judge had named for examples[i] (else examples[i].clauses).
 *  → {messages, est, examples: [{n, verdict, inferred, snippet}] (as SENT — the numbers `from` refers to), lines,
 *  dropped: {inferred, own}, counts: {own, inferred}}. */
function buildLearnInput({ block = '', examples = [], rubricHits = null } = {}) {
  const lines = blockLines(M.userBlockOf(block));   // what the judge reads (its first 1 500) — never more (invariant E)
  const shown = lines.map((l) => M.cleanPart(l, LEARN.lineMax, 'line').replace(/\s+/g, ' ').trim() || '…');
  const pool = (Array.isArray(examples) ? examples : []).map((x, i) => (x && M.VERDICTS.includes(x.verdict) ? {
    verdict: x.verdict, inferred: !!x.inferred, digest: M.cleanPart(str(x.snippet), M.EXAMPLE_DIGEST_MAX, 'line').replace(/\s+/g, ' ').trim(),
    hits: Array.isArray(rubricHits) ? rubricHits[i] : x.clauses,
  } : null)).filter((x) => x && x.digest);
  const own = pool.filter((x) => !x.inferred), inf = pool.filter((x) => x.inferred);
  const ownKept = own.slice(-LEARN.examplesMax);
  const room = LEARN.examplesMax - ownKept.length;   // the newest of each kind (both lists run oldest first)
  let list = [...ownKept, ...(room > 0 ? inf.slice(-room) : [])];
  const fixed = M.estTokens(TASK) + M.estTokens(JSON.stringify(LEARN_SCHEMA)) + 16;   // + the message framing
  const head = [`[block] ${shown.length} line${shown.length === 1 ? '' : 's'}`, ...(shown.length ? shown.map((l, i) => `${i + 1}. ${l}`) : ['(empty)'])].join('\n');
  const render = (xs) => {
    const k = xs.filter((x) => x.inferred).length;
    return [head, '', `[examples] ${xs.length}: ${xs.length - k} the person's own, ${k} inferred`, ...xs.map((x, i) => exampleLine(x, i + 1))].join('\n');
  };
  const dropped = { inferred: 0, own: 0 };
  let user = render(list), est = fixed + M.estTokens(user);
  while (est > LEARN.inputMax && list.length) {
    const j = list.findIndex((x) => x.inferred);   // the oldest inferred example leaves first …
    if (j >= 0) { list.splice(j, 1); dropped.inferred++; } else { list.shift(); dropped.own++; }   // … then the oldest own one
    user = render(list); est = fixed + M.estTokens(user);
  }
  return {
    messages: [{ role: 'system', content: TASK }, { role: 'user', content: user }], est,
    examples: list.map((x, i) => ({ n: i + 1, verdict: x.verdict, inferred: x.inferred, snippet: x.digest })), lines,
    dropped, counts: { own: list.filter((x) => !x.inferred).length, inferred: list.filter((x) => x.inferred).length },
  };
}

function parseAnswer(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return null; }
}
/** THE SIX RULES (header). `examples` = the input's examples AS SENT; `shown` = how many block lines the model was shown
 *  (the judge's read; a line past it is no line of the answer). → {ok, lines: [{text, kind, line, from, evidence,
 *  unsupported, long?, full?}], removed: [{line, reason}], note, counts} | {ok: false, why: 'bad-answer'}. */
function normalizeProposal(raw, { block = '', examples = [], shown = null } = {}) {
  const o = parseAnswer(raw);
  if (!o || !Array.isArray(o.lines)) return { ok: false, why: 'bad-answer', lines: [], removed: [], note: '', counts: { lines: 0, unsupported: 0, removed: 0, long: 0 } };
  const bl = blockLines(block), n = Array.isArray(examples) ? examples.length : 0;
  const nl = Number.isInteger(shown) && shown >= 0 ? Math.min(shown, bl.length) : bl.length;
  const seen = new Set(), claimed = new Set(), lines = [];
  for (const x of o.lines) {
    if (lines.length >= LEARN.linesMax) break;                                                                  // ①
    if (!x || typeof x !== 'object') continue;
    const full = clean(x.text, LEARN.fullMax);                                                                  // ② the model's words, scrubbed, read whole
    const at = full.search(ELIDED), head = at >= 0 ? full.slice(0, at) : full;
    const long = at >= 0 || charsOf(head) > LEARN.textMax;
    let text = long ? cutLine(head, LEARN.textMax) : head;                                                      // ② ≤ 120, never a marker (F4)
    let line = Number.isInteger(x.line) && x.line >= 1 && x.line <= nl && !claimed.has(x.line) ? x.line : null;   // ⑥
    let kind = KINDS.includes(x.kind) ? x.kind : line ? 'edit' : 'add';
    if (kind === 'add') line = null;
    else if (!line) kind = 'add';
    else if (kind === 'keep' || fold(clean(x.text, LEARN.lineMax)) === fold(clean(bl[line - 1], LEARN.lineMax))) { kind = 'keep'; text = bl[line - 1]; }   // the person's own words, as written — never cut, never demoted (F2)
    if (!text || seen.has(fold(text))) continue;                                                                // ⑤
    const from = [...new Set((Array.isArray(x.from) ? x.from : []).filter((i) => Number.isInteger(i) && i >= 1 && i <= n))].sort((a, b) => a - b);   // ③
    seen.add(fold(text));
    if (line) claimed.add(line);
    const cut = kind !== 'keep' && long;                                                                       // a keep is the person's line: never cut
    lines.push({ text, kind, line, from, evidence: clean(x.evidence, LEARN.evidenceMax), unsupported: kind !== 'keep' && !from.length, ...(cut ? { long: true, full } : {}) });   // ④
  }
  const removed = [];
  for (const r of Array.isArray(o.removed) ? o.removed : []) {
    if (!r || !Number.isInteger(r.line) || r.line < 1 || r.line > nl || claimed.has(r.line) || removed.some((x) => x.line === r.line)) continue;   // ⑥
    removed.push({ line: r.line, reason: clean(r.reason, LEARN.reasonMax) });
  }
  return { ok: true, lines, removed, note: clean(o.note, LEARN.noteMax), counts: { lines: lines.length, unsupported: lines.filter((l) => l.unsupported).length, removed: removed.length, long: lines.filter((l) => l.long).length } };
}

/** THE CARD'S TABLE, on the STORED block whole (F6). → {rows: [{op: keep|edit|add, text, was, line, from, evidence,
 *  unsupported, long, full?, tick}], removed: [{op: remove|unmentioned|replaced|unproven|shortened, line, text, reason, tick}],
 *  stored: {chars, max, over}, counts}. `tick` = the line goes into the saved block. */
function diffTable(block, proposal) {
  const bl = blockLines(block);
  const p = proposal && proposal.ok !== false ? proposal : { lines: [], removed: [] };
  const rows = (p.lines || []).map((x) => ({ op: x.kind, text: x.text, was: x.kind === 'edit' && x.line ? bl[x.line - 1] : null, line: x.line || null, from: (x.from || []).slice(), evidence: x.evidence || '', unsupported: !!x.unsupported, long: !!x.long, ...(x.long ? { full: str(x.full) } : {}), tick: !x.unsupported && !x.long }));
  // ONE rule for every rewording (R3-F1): only a keep claims its line; the line an edit rewords stays a row, ticked unless
  // the rewording is (pre-ticked ⇒ `replaced`, unticked; no evidence ⇒ `unproven` — F2; cut ⇒ `shortened` — F4)
  const claimed = new Set(rows.filter((r) => r.op === 'keep').map((r) => r.line).filter(Boolean));
  const linked = new Map(rows.filter((r) => r.op === 'edit' && r.line).map((r) => [r.line, r.tick ? 'replaced' : r.unsupported ? 'unproven' : 'shortened']));
  const named = new Map((p.removed || []).map((r) => [r.line, r.reason]));
  const removed = bl.map((text, i) => ({ line: i + 1, text })).filter((r) => !claimed.has(r.line))
    .map((r) => (named.has(r.line) ? { op: 'remove', ...r, reason: named.get(r.line) || '', tick: false } : { op: linked.get(r.line) || 'unmentioned', ...r, reason: '', tick: linked.get(r.line) !== 'replaced' }));
  const c = (xs, op) => xs.filter((r) => r.op === op).length;
  const chars = str(block).length;
  return { rows, removed, stored: { chars, max: M.USER_BLOCK_MAX, over: chars > M.USER_BLOCK_MAX }, counts: { keep: c(rows, 'keep'), edit: c(rows, 'edit'), add: c(rows, 'add'), remove: c(removed, 'remove'), unmentioned: c(removed, 'unmentioned'), replaced: c(removed, 'replaced'), unproven: c(removed, 'unproven'), shortened: c(removed, 'shortened'), unsupported: rows.filter((r) => r.unsupported).length, long: rows.filter((r) => r.long).length } };
}
/** What Save writes: the ticked proposed lines in order, then the ticked lines of the block that would have left —
 *  WHOLE (lane rule-learning-fix F3: the 1 500 slice here dropped the "kept" lines, which come last, unsaid). */
function blockFrom(table) {
  const t = table || {};
  const out = [...(t.rows || []), ...(t.removed || [])].filter((r) => r && r.tick).map((r) => str(r.text).trim()).filter(Boolean);
  return out.join('\n');
}
/** Does `text` fit the block? → {chars, max, over, empty} — counted as the box's own maxLength counts (UTF-16 units);
 *  over ⇒ the card says so and its Save waits (the settings door refuses it by name — never a slice). */
function blockFit(text) {
  const s = str(text);
  return { chars: s.length, max: M.USER_BLOCK_MAX, over: s.length > M.USER_BLOCK_MAX, empty: !s.trim() };
}

const fillWords = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(v, k) ? String(v[k]) : m));
/** P1's weekly digest (OFF — the words and counts only): the judgments labeled since `sinceAt`, the person's own vs
 *  inferred; `due` = enough of them (≥ LEARN.weeklyMin) to be worth one call. */
function weeklySummary(examples, sinceAt = 0, { t = fillWords } = {}) {
  const fresh = (Array.isArray(examples) ? examples : []).filter((x) => x && M.VERDICTS.includes(x.verdict) && Number(x.at) > Number(sinceAt || 0));
  const inferred = fresh.filter((x) => x.source === 'implicit').length, own = fresh.length - inferred;
  return { own, inferred, total: fresh.length, due: fresh.length >= LEARN.weeklyMin, text: t('This week: {n} decisions ({own} yours, {inferred} inferred)', { n: fresh.length, own, inferred }) };
}

module.exports = {
  MODELS, DEFAULT_TIER, LEARN, KINDS, USE_CAP_CENTS, LEARN_SCHEMA, TASK,
  modelOf, learnCost, availability, blockLines, cutLine, buildLearnInput, normalizeProposal, diffTable, blockFrom, blockFit, weeklySummary,
};
