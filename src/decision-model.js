'use strict';
/**
 * THE DECISION MODEL (lane decision-core, D1 of docs/design-decision-api.zh.md) — PURE, CJS, bundled by the
 * server and the client alike. It imports only the ONE belt on peer text (src/peer-text.js, PURE → PURE): the
 * frame rule may have exactly one copy outside channel-record (the page-dialog module's, pinned by
 * test-peer-text-census), so every text part that leaves for a judge is folded and frame-inert through it.
 *
 * WHAT IS HERE (the contract D2 / D3 build on — every name below is exported):
 *  · the question types (predicate | choice | score) and THE TWO DIALECTS — OpenAI `POST /v1/decisions`
 *    (`input` + `questions[]`, `answers[]` by name, a per-question `refusal`) and OpenRouter
 *    `POST /api/alpha/decisions` (`{model, questions: {name → {type: noul|choice|score, instructions, criteria}},
 *    state}`, answers keyed by name, `usage.input_tokens/output_tokens/cost`, no refusal type: a missing answer
 *    IS the refusal). `buildRequest` / `normalizeAnswers` / `usageOf` are the only places a dialect is spelled;
 *  · `inputPlan(use)` + `buildInput(use, parts)` — per use: what goes in (fixed first, variable last), each
 *    part's cap, the head + tail cut at sentence ends with the elision marker, the exclusions (secret-named
 *    fields erased, addresses cut to their domain, frames inert), the memo material, the batch size;
 *  · `estTokens` (conservative: a CJK character = 1 token, other ASCII ≈ 3 characters a token);
 *  · `budgetVerdict` — the ONE gate before a paid call, in USD: what the day SETTLED + what is RESERVED by calls in
 *    flight + this call's estimate (input tokens × `rateOf`), the day = the instance's local day, the default
 *    ceiling = 100 cents (owner 2026-10-12: 1 USD a day); `settleUsd` — what a call finally costs (the vendor's
 *    recorded cost, else the reservation; an answered 4xx / 5xx costs 0); `nextBackoff` — a wall is never retried;
 *  · `rowStopOf` — the answers that stop the ROW until the owner changes the key or the model (401 / 403 the key,
 *    402 the plan, 400 the request's shape — lane decision-vendor-hygiene), never a call a record;
 *  · `oneShotBody` — THE request body of both vendor callers of the row (the judge and the text client): the bytes
 *    serialized once, handed over once, never re-sent by the platform (lane judge-one-shot-body);
 *  · `scrubQuestions` — the owner's words that ride the QUESTIONS (a rule's condition, a choice's description) pass
 *    the ONE scrub too, before buildRequest (lane decision-vendor-hygiene);
 *  · `journalRow` — what a call leaves behind: never the key, never a text the vendor or a peer wrote;
 *  · RUBRIC v2 (needs_now + the seven clauses; `matters` only when the person's block is non-empty) — the REASON of a
 *    verdict is the clauses the decision itself selected (predicate ≥ the clause threshold), named through OUR word
 *    table; vendor prose has no field here;
 *  · THE FACTS LINE of an attention record (lane decision-attention-facts): `attentionFacts` words what the PRODUCT
 *    measured (addressed / kind / when the reader last spoke / unread since the read line / the same mail in K inboxes /
 *    an automated sender) — counts, kinds and ages, never a name, an id or an address; `trimMailBody` drops a mail's
 *    quoted replies, signature and footer before the cut; `implicitLabel` reads an example off what the owner did;
 *  · `criteriaProposal` — the candidate catalogue against the person's labeled examples: it PROPOSES lines of
 *    text for their own block, it never applies one.
 * No I/O, no clock, no crypto: the engine hands in `now`, the local-day offset and `sha`.
 */
const P = require('./peer-text.js');
const S = require('./secret-shapes.js');

const QUESTION_TYPES = Object.freeze(['predicate', 'choice', 'score']);
const PROVIDERS = Object.freeze(['openai', 'openrouter']);
const PROVIDER_LABEL = Object.freeze({ openai: 'OpenAI', openrouter: 'OpenRouter' });
// The model a row without one uses. OpenRouter: PINNED BY PROBE ON 2026-10-12 (scripts/decision-probe.mjs with the
// owner's key, probe-20261012T060934Z): on the alpha route ONLY openai/gpt-6-luna-decisions answered (200, 211 ms);
// typesafe/jev-router and openai/gpt-6-luna were refused 400. OpenAI: its one decisions model (no key probed yet).
const DEFAULT_MODEL = Object.freeze({ openai: 'gpt-6-luna', openrouter: 'openai/gpt-6-luna-decisions' });
// INPUT price per 1M tokens (USD) — OpenAI's decisions price; OpenRouter's chat row for openai/gpt-6-luna (the probe
// MEASURED 0.106 / 1M on the alpha route: 194 input tokens cost 0.000020564 USD). A response that carries `usage.cost`
// (OpenRouter) is counted at that cost instead, so the estimate only sizes the budget check before the call.
const PRICE_PER_MTOK_USD = Object.freeze({ openai: 0.10, openrouter: 0.10 });
const DAILY_BUDGET_CENTS_DEFAULT = 100;
const THRESHOLD_DEFAULT = 0.70;
const THRESHOLD_RANGE = Object.freeze([0.5, 0.95]);
const BACKOFF_MS = Object.freeze([60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000]);   // a 5xx / no answer: 1 → 5 → 15 min
const RETRY_AFTER_MAX_MS = 60 * 60 * 1000;   // a 429's Retry-After is honoured up to an hour
const RATE_MIN_CALLS = 20;                   // recorded-cost calls before the row's own average prices the estimate
const MEMO_MAX = 5000;
const FEATURES = Object.freeze(['attention', 'rules', 'routing', 'inbox']);   // inbox = use ④, the For-you tray's two sections (lane inbox-decision-group)
const WHY = Object.freeze(['plugin-off', 'feature-off', 'no-key', 'account-never', 'reconnect', 'plan', 'shape', 'backoff', 'daily-budget', 'use-budget', 'per-hour']);   // + use-budget: a use's own cap a day (lane rule-learning)

const DIALECTS = Object.freeze({
  openai: { baseUrl: 'https://api.openai.com', path: '/v1/decisions' },
  openrouter: { baseUrl: 'https://openrouter.ai', path: '/api/alpha/decisions' },
});
const dialectOf = (provider) => (PROVIDERS.includes(provider) ? provider : null);
const urlOf = (provider, baseUrl = null) => {
  const d = DIALECTS[dialectOf(provider)];
  return d ? String(baseUrl || d.baseUrl).replace(/\/+$/, '') + d.path : null;
};

// ── questions ─────────────────────────────────────────────────────────────
const str = (v) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v));
/** A question of ours: {type, name, instructions, whenTrue?, whenFalse?, choices?[{value, description}],
 *  levels?[{label, description}]}. Returns the named complaint or null. */
function questionError(q) {
  if (!q || typeof q !== 'object') return 'not a question';
  if (!QUESTION_TYPES.includes(q.type)) return `type must be one of ${QUESTION_TYPES.join('|')}`;
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(str(q.name))) return 'name must be a lowercase word [a-z0-9_]';
  if (!str(q.instructions).trim()) return 'instructions required';
  if (q.type === 'choice' && !(Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 9 && q.choices.every((c) => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(str(c && c.value))))) return 'a choice question names 2–9 choices by value';
  if (q.type === 'score' && !(Array.isArray(q.levels) && q.levels.length >= 2 && q.levels.length <= 10 && q.levels.every((l) => str(l && l.label).trim()))) return 'a score question names 2–10 levels';
  return null;
}

/** THE ONE REQUEST BODY per dialect. `input` is always ONE text (both dialects take a string). */
function buildRequest(provider, { model, input, questions }) {
  const dialect = dialectOf(provider);
  if (!dialect) throw new Error(`unknown decision provider '${provider}'`);
  (questions || []).forEach((q, i) => { const e = questionError(q); if (e) throw new Error(`question ${i + 1}: ${e}`); });
  const m = str(model) || DEFAULT_MODEL[dialect];
  if (dialect === 'openai') {
    return {
      model: m, input: str(input),
      questions: questions.map((q) => {
        const o = { type: q.type, name: q.name, instructions: q.instructions };
        if (q.type === 'choice') o.choices = q.choices.map((c) => ({ value: c.value, description: str(c.description) }));
        if (q.type === 'score') o.levels = q.levels.map((l) => ({ label: l.label, description: str(l.description) }));
        return o;
      }),
    };
  }
  const qs = {};
  for (const q of questions) {
    if (q.type === 'predicate') qs[q.name] = { type: 'noul', instructions: q.instructions, criteria: { true: str(q.whenTrue) || 'Yes — ' + q.instructions, false: str(q.whenFalse) || 'No — it does not.' } };
    else if (q.type === 'choice') qs[q.name] = { type: 'choice', instructions: q.instructions, criteria: Object.fromEntries(q.choices.map((c) => [c.value, str(c.description) || c.value])) };
    else qs[q.name] = { type: 'score', instructions: q.instructions, criteria: q.levels.map((l) => (str(l.description) ? `${l.label} — ${l.description}` : l.label)) };
  }
  return { model: m, questions: qs, state: str(input) };
}

const prob = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
/** {value → p} from either dialect's spelling (an array of {value|label, probability} or a map), keyed ONLY by
 *  the question's own values / level labels — a key the question never named is dropped, never echoed. */
function probMap(raw, keys) {
  const out = {};
  const put = (k, p) => { if (keys.includes(k) && prob(p) !== null) out[k] = p; };
  if (Array.isArray(raw)) for (const e of raw) put(str(e && (e.value !== undefined ? e.value : e.label)), e && e.probability);
  else if (raw && typeof raw === 'object') for (const [k, p] of Object.entries(raw)) put(k, p);
  return out;
}
/** THE ONE ANSWER SHAPE: {name, type, probability} | {name, type, choice, probabilities, confidence} |
 *  {name, type, score, probabilities, confidence} | {name, type, refused: true, why: refusal|missing|malformed};
 *  + `dialect`. One per ASKED question, in the asked order. No vendor string survives except a choice value or a
 *  level label the question itself named. */
function normalizeAnswers(provider, body, questions) {
  const dialect = dialectOf(provider);
  const raw = body && typeof body === 'object' ? body.answers : null;
  const byName = new Map();
  if (dialect === 'openai' && Array.isArray(raw)) for (const a of raw) { if (a && typeof a.name === 'string' && !byName.has(a.name)) byName.set(a.name, a); }
  if (dialect === 'openrouter' && raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, a] of Object.entries(raw)) byName.set(k, a);
  return (questions || []).map((q) => {
    const a = byName.get(q.name);
    const base = { name: q.name, type: q.type, dialect };
    const refused = (why) => ({ ...base, refused: true, why });
    if (!a || typeof a !== 'object') return refused('missing');
    if (a.type === 'refusal') return refused('refusal');
    if (q.type === 'predicate') {
      const p = prob(dialect === 'openrouter' ? a.noul : a.probability);
      return (dialect === 'openrouter' ? a.type === 'noul' : a.type === 'predicate') && p !== null ? { ...base, probability: p } : refused('malformed');
    }
    if (q.type === 'choice') {
      const keys = q.choices.map((c) => c.value);
      if (a.type !== 'choice' || !keys.includes(str(a.choice))) return refused('malformed');
      return { ...base, choice: str(a.choice), probabilities: probMap(a.probabilities, keys), confidence: prob(a.confidence) };
    }
    const labels = q.levels.map((l) => l.label);
    const s = a.score;
    if (a.type !== 'score' || typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > labels.length - 1) return refused('malformed');
    return { ...base, score: s, probabilities: probMap(a.probabilities, labels.concat(labels.map((_, i) => String(i)))), confidence: prob(a.confidence) };
  });
}

/** {inputTokens, outputTokens, costUsd|null} — the vendor's own count; costUsd only when it says one. */
function usageOf(provider, body) {
  const u = (body && body.usage) || {};
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
  const cost = Number(u.cost);
  return { inputTokens: n(u.input_tokens), outputTokens: n(u.output_tokens), costUsd: dialectOf(provider) === 'openrouter' && Number.isFinite(cost) && cost >= 0 ? cost : null };
}
const estimateUsd = (inputTokens, pricePerMtok) => (Math.max(0, Number(inputTokens) || 0) * (Number(pricePerMtok) || 0)) / 1e6;
/** What one call cost: the vendor's `cost` when it said one, else input tokens × the input price. */
const usdOf = (usage, pricePerMtok) => (usage && usage.costUsd !== null && usage.costUsd !== undefined ? usage.costUsd : estimateUsd(usage && usage.inputTokens, pricePerMtok));

// ── tokens ────────────────────────────────────────────────────────────────
const WIDE_RE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/u;
/** CONSERVATIVE: a CJK / Hangul / full-width character = 1 token, any other non-ASCII character = 1 token,
 *  ASCII ≈ 3 characters a token (the vendors' own ≈ 4). Over, never under: the budget asks before the call. */
function estTokens(text) {
  const s = str(text);
  let ascii = 0, other = 0;
  for (const ch of s) { if (ch.charCodeAt(0) < 128) ascii++; else other++; }
  return other + Math.ceil(ascii / 3);
}
const questionTokens = (questions) => estTokens(JSON.stringify(questions || []));

// ── context management (design §2.10) ─────────────────────────────────────
const SENTENCE_END = /[。！？.!?\n]/;
const elision = (n) => `…[${n} characters omitted]…`;
/** The cut point at or before `at` that ends a sentence (after its terminator); else the last whitespace; else
 *  `at` (a single sentence longer than the window — the only hard cut, and it is still marked). */
function headCut(s, at) {
  for (let i = Math.min(at, s.length) - 1; i > 0; i--) if (SENTENCE_END.test(s[i])) return i + 1;
  for (let i = Math.min(at, s.length) - 1; i > 0; i--) if (/\s/.test(s[i])) return i + 1;
  return at;
}
/** The tail start at or after `at` that begins a sentence (after a terminator); else after whitespace; else `at`. */
function tailCut(s, at) {
  for (let i = Math.max(0, at - 1); i < s.length - 1; i++) if (SENTENCE_END.test(s[i])) return i + 1;
  for (let i = Math.max(0, at - 1); i < s.length - 1; i++) if (/\s/.test(s[i])) return i + 1;
  return at;
}
/** HEAD + TAIL: over `max` characters, keep 60 % of the room from the front and 40 % from the back, each cut
 *  backed off to a sentence end, the middle replaced by the elision marker (its own length counted in `max`). */
function cutHeadTail(text, max) {
  const s = str(text);
  if (s.length <= max) return s;
  const room = Math.max(0, max - elision(s.length).length);
  const h = headCut(s, Math.floor(room * 0.6));
  const t = tailCut(s, s.length - Math.floor(room * 0.4));
  const head = s.slice(0, h).replace(/\s+$/, ''), tail = s.slice(Math.max(t, h)).replace(/^\s+/, '');
  return `${head} ${elision(s.length - head.length - tail.length)} ${tail}`.trim();
}
/** Cut until the token estimate fits (bounded: a few shrinking passes, never a loop). */
function fitTokens(text, tokens) {
  let s = str(text);
  for (let i = 0; i < 6 && estTokens(s) > tokens; i++) s = cutHeadTail(s, Math.max(0, Math.floor(s.length * (tokens / estTokens(s)) * 0.95)));
  return estTokens(s) > tokens ? '' : s;
}

const SECRET_KEY_RE = /token|secret|key|authorization|cookie|passw/i;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g;
/** An address keeps its domain only (`…@example.com`) — a display name is enough for a judge. */
const maskAddresses = (s) => str(s).replace(EMAIL_RE, '…@$1');
/** A JSON value for a judge: keys kept, a secret-named key's value ERASED, strings ≤ 200 characters, bounded
 *  depth and breadth (a webhook payload's digest, §2.10 ⑤). */
function eraseSecrets(v, depth = 0) {
  if (depth > 6) return '…';
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => eraseSecrets(x, depth + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v).slice(0, 50)) o[k] = SECRET_KEY_RE.test(k) ? '[erased]' : eraseSecrets(x, depth + 1);
    return o;
  }
  if (typeof v === 'string') { const t = scrub(v, 50); return t.length > 200 ? t.slice(0, 200) + '…' : t; }   // the scrub before the cut (inbox-verify F1)
  return typeof v === 'number' || typeof v === 'boolean' || v === null ? v : str(v).slice(0, 200);
}
/** THE ONE SCRUB (inbox-verify F1, design §2.8 — the law: no vendor-bound text leaves without it): the tree's ONE secret
 *  table (secret-shapes.js redactSecrets, R1–R8 incl. the opt-in key-material runs) on the RAW text, BEFORE any cut — a
 *  secret split by a cut must not leak its head. Bounded first to 4× the part's cap + the longest value the table judges
 *  whole (VALUE_MAX): a secret that starts inside the kept 4× is seen whole. Addresses are NOT secrets (maskAddresses). */
const scrub = (raw, max) => S.redactSecrets(P.cutText(str(raw), Math.max(64, max * 4) + S.VALUE_MAX), { runs: true }).text;
/** EVERY text part on its way out: scrubbed first (the ONE scrub, above), bounded (the belt walks no more than 4× its
 *  cap), folded and frame-inert (the belt), addresses cut to their domain, then the head + tail cut to the part's own cap. */
function cleanPart(raw, max, kind = 'block') {
  const bounded = P.cutText(scrub(raw, max), Math.max(64, max * 4));
  return cutHeadTail(maskAddresses(P.toAgentText(bounded, { max: Math.max(64, max * 4), kind })), max);
}
/** THE ONE SCRUB on the QUESTIONS (lane decision-vendor-hygiene, B-d375): a rule's condition, a routing rule's choice
 *  descriptions and a webhook rule's condition are the OWNER's words and ride `questions[]`, not the input — buildInput
 *  never sees them, so the engine passes every question through here before buildRequest. Every string field of a
 *  question, of its choices and of its levels goes through the same `scrub` as every input part, EXCEPT the identifiers
 *  the answers are keyed by (`type`, `name`, `choices[].value`, `levels[].label` — questionError holds a value to a
 *  slug). Nothing is cut (the bound is 4× QUESTION_TEXT_MAX); a copy — the caller's question is never written. */
const QUESTION_TEXT_MAX = 1000;
const QUESTION_IDS = Object.freeze({ question: ['type', 'name'], choice: ['value'], level: ['label'] });
const scrubFields = (o, ids) => (o && typeof o === 'object' && !Array.isArray(o)
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && !ids.includes(k) ? scrub(v, QUESTION_TEXT_MAX) : v])) : o);
function scrubQuestions(questions) {
  return (Array.isArray(questions) ? questions : []).map((q) => {
    const o = scrubFields(q, QUESTION_IDS.question);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
    if (Array.isArray(o.choices)) o.choices = o.choices.map((c) => scrubFields(c, QUESTION_IDS.choice));
    if (Array.isArray(o.levels)) o.levels = o.levels.map((l) => scrubFields(l, QUESTION_IDS.level));
    return o;
  });
}

// The plans — DATA (design §2.10's table): `fixed` parts first, `variable` (per record) last; caps in characters
// per part, ceilings in estTokens. `batch` = records per call — ONE for attention, inbox and every wake-path use (the
// design's 10 For-you items a call became ONE item a call, ≤ 10 calls a pass — `perPass`; the probe's lesson): the probe (2026-10-12, 20 records,
// openai/gpt-6-luna-decisions) measured batch-of-5 at 1 608 vs single 1 761 input tokens a record (9 % saved) but a
// needs_now agreement of only 12/20 at 0.7 (mean |Δp| 0.383) — batching changes verdicts, so the attention scan judges
// one record per call (many questions per record stay: batchQuestions); `memo` = what the memo key is made of.
const PART = (name, max, extra = {}) => Object.freeze({ name, max, ...extra });
const PLANS = Object.freeze({
  attention: Object.freeze({ fixed: [PART('rubric', 2400), PART('userBlock', 1500), PART('examples', 12 * 220, { each: 200, count: 12 })], variable: [PART('facts', 400, { kind: 'line' }), PART('title', 200, { kind: 'line' }), PART('source', 200, { kind: 'line' }), PART('sender', 200, { kind: 'line' }), PART('body', 2048)], fixedCeiling: 1700, recordCeiling: 800, batch: 1, wakePath: false, memo: ['use', 'id', 'lastAt', 'rubric', 'userBlock', 'examples'] }),
  rule: Object.freeze({ fixed: [PART('condition', 500), PART('choices', 8 * 130, { each: 120, count: 8 })], variable: [PART('body', 2048), PART('thread', 3 * 320, { each: 300, count: 3 })], fixedCeiling: 500, recordCeiling: 1000, batch: 1, wakePath: true, memo: ['use', 'id', 'rule'] }),
  routing: Object.freeze({ fixed: [PART('condition', 500), PART('choices', 9 * 210, { each: 200, count: 9 })], variable: [PART('body', 2048), PART('thread', 3 * 320, { each: 300, count: 3 })], fixedCeiling: 800, recordCeiling: 1000, batch: 1, wakePath: true, memo: ['use', 'id', 'rule', 'groups'] }),
  inbox: Object.freeze({ fixed: [PART('levels', 600)], variable: [PART('facts', 240, { kind: 'line' }), PART('text', 400), PART('detail', 800), PART('session', 200, { kind: 'line' })], fixedCeiling: 200, recordCeiling: 400, batch: 1, perPass: 10, wakePath: false, memo: ['use', 'id', 'levels', 'digest'] }),
  webhook: Object.freeze({ fixed: [PART('condition', 500)], variable: [PART('payload', 4096, { json: true })], fixedCeiling: 200, recordCeiling: 1400, batch: 1, wakePath: true, memo: ['use', 'id', 'rule'] }),
  test: Object.freeze({ fixed: [], variable: [PART('body', 200)], fixedCeiling: 0, recordCeiling: 120, batch: 1, wakePath: false, memo: ['use', 'id'] }),
});
const USES = Object.freeze(Object.keys(PLANS));
const NEVER = Object.freeze(['credentials, tokens, cookies, API keys (secret-named fields are erased; secret-shaped text is redacted — the ONE scrub)', 'attachment bytes, images, page screenshots', 'records of other accounts', 'agent frame text (inert through the belt)', 'mail addresses (display name + domain only)', 'the owner\'s agent-internal context']);
/** The plan of one use, with its ceiling for `n` records (n ≤ batch; `batch` = the probe's own measurement override). */
function inputPlan(use, n = 1, batch = null) {
  const p = PLANS[use];
  if (!p) throw new Error(`unknown decision use '${use}'`);
  const k = Math.max(1, Math.min(batch || p.batch, Math.floor(Number(n) || 1)));
  return { use, ...p, n: k, ceiling: p.fixedCeiling + k * p.recordCeiling, never: NEVER };
}
const listPart = (v, each, count) => (Array.isArray(v) ? v : v ? [v] : []).slice(-count).map((x) => cleanPart(typeof x === 'object' && x ? [x.title, x.snippet || x.text, x.verdict ? `→ ${x.verdict}${x.inferred ? ' (inferred)' : ''}` : ''].filter(Boolean).join(' · ') : x, each, 'line')).filter(Boolean);
/** THE INPUT of one call: `[fixed parts] ——— [record 1] … [record n]`, every part cleaned and capped, the whole
 *  fitted to the plan's ceiling (a record that cannot fit is cut further, head + tail). `parts` = the fixed
 *  part values by name + `records: [{name → value}]` (or the record's values directly for one record).
 *  Returns {text, est, ceiling, truncated, n}. */
function buildInput(use, parts = {}, { batch = null } = {}) {
  const records = Array.isArray(parts.records) ? parts.records : [parts];
  const cap = batch || inputPlan(use).batch;
  if (records.length > cap) throw new Error(`a ${use} call takes at most ${cap} record(s) — ${records.length} asked`);   // never a silent drop
  const plan = inputPlan(use, records.length, cap);
  let truncated = false;
  const mark = (raw, out) => { if (str(raw).length > out.length || out.includes('characters omitted]…')) truncated = true; return out; };
  const fixed = [];
  for (const f of plan.fixed) {
    const v = parts[f.name];
    if (v === undefined || v === null || v === '') continue;
    const body = f.count ? listPart(v, f.each, f.count).map((x) => '- ' + x).join('\n') : mark(v, cleanPart(v, f.max));
    if (body) fixed.push(`[${f.name}]\n${body}`);
  }
  let fixedText = fitTokens(fixed.join('\n\n'), plan.fixedCeiling);
  if (fixed.length && fixedText.length < fixed.join('\n\n').length) truncated = true;
  const recs = records.slice(0, plan.n).map((r, i) => {
    const lines = [];
    for (const f of plan.variable) {
      const v = r && r[f.name];
      if (v === undefined || v === null || v === '') continue;
      const val = f.json ? cleanPart(JSON.stringify(eraseSecrets(typeof v === 'string' ? safeJson(v) : v)), f.max, 'block')
        : f.count ? listPart(v, f.each, f.count).join('\n') : mark(v, cleanPart(v, f.max, f.kind || 'block'));
      if (val) lines.push(`${f.name}: ${val}`);
    }
    const head = plan.n > 1 ? `[record ${i + 1}]` : '[record]';
    const body = lines.join('\n');
    const fit = fitTokens(body, plan.recordCeiling - estTokens(head) - 2);
    if (fit.length < body.length) truncated = true;
    return `${head}\n${fit}`;
  });
  const text = [fixedText, '———', ...recs].filter(Boolean).join('\n\n');
  return { text, est: estTokens(text), ceiling: plan.ceiling, truncated, n: plan.n };
}
function safeJson(s) { try { return JSON.parse(s); } catch { return str(s); } }

/** The memo key's material — the use + the record's identity + everything a verdict depends on. The engine
 *  takes sha256 of it (`memoKey(…, sha)`); a redraw, a reopen and a restart all find the same key. */
function memoMaterial(use, m = {}) {
  const plan = PLANS[use];
  if (!plan) throw new Error(`unknown decision use '${use}'`);
  return JSON.stringify(plan.memo.map((k) => (k === 'use' ? use : k === 'rubric' ? `v${RUBRIC.version}` : k === 'levels' ? `v${INBOX.version}` : m[k] === undefined ? null : m[k])));
}
const memoKey = (use, m, sha) => sha(memoMaterial(use, m));
/** Batch questions: record i's question `name` becomes `r<i>_<name>`; `unbatchAnswers` splits them back. */
const batchQuestions = (questions, n) => Array.from({ length: n }, (_, i) => questions.map((q) => ({ ...q, name: `r${i + 1}_${q.name}` }))).flat();
function unbatchAnswers(answers, n) {
  return Array.from({ length: n }, (_, i) => answers.filter((a) => a.name.startsWith(`r${i + 1}_`)).map((a) => ({ ...a, name: a.name.slice(`r${i + 1}_`.length) })));
}

// ── the budget (design §2.7) ──────────────────────────────────────────────
/** The instance's local day of `ms` (`offsetMin` = Date#getTimezoneOffset of that instant, handed in). */
function dayOf(ms, offsetMin = 0) {
  const d = new Date(Number(ms) - Number(offsetMin || 0) * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
const microUsd = (usd) => Math.round((Number(usd) || 0) * 1e8);   // compare money in 1e-8 USD steps (no float drift at the edge)
/** USD per INPUT token for the estimate: the row's own recorded average (`stats` = {calls, inputTokens, usd} over
 *  calls whose vendor said a cost) once it has RATE_MIN_CALLS of them, else the fixed input price. */
function rateOf(stats, pricePerMtok = PRICE_PER_MTOK_USD.openai) {
  const st = stats || {};
  if ((Number(st.calls) || 0) >= RATE_MIN_CALLS && Number(st.inputTokens) > 0 && Number(st.usd) > 0) return Number(st.usd) / Number(st.inputTokens);
  return (Number(pricePerMtok) || 0) / 1e6;
}
/** THE GATE. Units = USD: the day's SETTLED cost + the RESERVED estimates of calls in flight (`spentUsd`) + this
 *  call's estimate (`estUsd`) against the ceiling in cents. The engine reserves `estUsd` in the same synchronous
 *  step as this verdict, so N calls in flight can never all pass one ceiling (decision-verify F2).
 *  → {ok:true, ceilingUsd} | {ok:false, why ∈ WHY, retryAt?}. Order: the switches, the key, the account, a key the
 *  provider refused, the plan / the request shape it refused (the row stops — lane decision-vendor-hygiene), then the
 *  walls (a backoff names its end), then the money, then the hour. A USE'S OWN CAP (lane rule-learning: `learn`, the
 *  text model that drafts the person's block): `useSpentUsd` (that use's settled + reserved today) + this estimate against
 *  `useCeilingCents` — INSIDE the daily budget, never beside it (the day's money is asked first). */
function budgetVerdict({ pluginOn = false, featureOn = false, keyPresent = false, accountNever = false, reconnect = false, plan = false, shape = false, backoffUntil = 0, now = 0,
  spentUsd = 0, estUsd = 0, ceilingCents = undefined, ceilingUsd = undefined, hourCount = 0, perHour = Infinity, useSpentUsd = 0, useCeilingCents = undefined } = {}) {
  const cents = ceilingCents !== undefined ? Number(ceilingCents) : ceilingUsd !== undefined ? Number(ceilingUsd) * 100 : DAILY_BUDGET_CENTS_DEFAULT;
  const ceiling = (Number.isFinite(cents) && cents >= 0 ? cents : DAILY_BUDGET_CENTS_DEFAULT) / 100;
  if (!pluginOn) return { ok: false, why: 'plugin-off' };
  if (!featureOn) return { ok: false, why: 'feature-off' };
  if (!keyPresent) return { ok: false, why: 'no-key' };
  if (accountNever) return { ok: false, why: 'account-never' };
  if (reconnect) return { ok: false, why: 'reconnect' };
  if (plan) return { ok: false, why: 'plan' };
  if (shape) return { ok: false, why: 'shape' };
  if (Number(backoffUntil) > Number(now)) return { ok: false, why: 'backoff', retryAt: Number(backoffUntil) };
  if (microUsd(spentUsd) + microUsd(estUsd) > microUsd(ceiling)) return { ok: false, why: 'daily-budget', ceilingUsd: ceiling };
  const useCap = useCeilingCents === undefined || useCeilingCents === null ? null : Number(useCeilingCents);
  if (useCap !== null && Number.isFinite(useCap) && microUsd(useSpentUsd) + microUsd(estUsd) > microUsd(Math.max(0, useCap) / 100)) return { ok: false, why: 'use-budget', ceilingUsd: Math.max(0, useCap) / 100 };
  if ((Number(hourCount) || 0) >= perHour) return { ok: false, why: 'per-hour' };
  return { ok: true, ceilingUsd: ceiling };
}
/** What a call finally costs (SETTLE replaces its reservation): an answered 4xx / 5xx = 0 (the provider refused or
 *  failed before judging — OpenAI and OpenRouter bill no error answer); the vendor's recorded `usage.cost` when it
 *  said one; else the larger of the reservation and the vendor's input tokens × price — a 200 without usage, a body
 *  that never parsed, a timeout or a dropped connection (status 0: it may have been judged) keep the reservation.
 *  `failed` (lane rule-learning-fix L3 — the judge and the text client alike) = `fetchFailOf`'s name for the request
 *  primitive's failure: 'unsent' (nothing left the box) and 'redirect' (a 3xx, never followed — nothing was generated)
 *  cost 0, so the reservation is RELEASED, never settled. */
function settleUsd({ status = 0, usage = null, reservedUsd = 0, pricePerMtok = PRICE_PER_MTOK_USD.openai, failed = null } = {}) {
  if (status >= 400 && status <= 599) return 0;
  if (failed === 'unsent' || failed === 'redirect') return 0;
  if (usage && usage.costUsd !== null && usage.costUsd !== undefined) return usage.costUsd;
  return microUsd(Math.max(Number(reservedUsd) || 0, estimateUsd(usage && usage.inputTokens, pricePerMtok))) / 1e8;
}
/** THE request primitive's failure, by name (lane rule-learning-fix L2 / L3 — the judge's fetch and the text client's
 *  share it): 'redirect' = the vendor's URL answered a 3xx and `redirect: 'error'` refused to follow it (nothing goes to
 *  another origin); 'unsent' = nothing left the box (a refused / unresolvable connection, an unreachable network, a bad
 *  URL, a TLS failure — a connect-phase code on the error or one of its causes); null = anything else (a timeout, a
 *  reset mid-answer): the request may have reached the vendor, so its reservation stays charged. */
const UNSENT_CODES = Object.freeze(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EAI_NONAME', 'ENETUNREACH', 'EHOSTUNREACH', 'EADDRNOTAVAIL', 'ERR_INVALID_URL',
  'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID']);
function fetchFailOf(err) {
  for (let e = err, i = 0; e && typeof e === 'object' && i < 4; e = e.cause, i++) {
    if (e.message === 'unexpected redirect') return 'redirect';   // Node's fetch words a 3xx under redirect: 'error' so
    if (UNSENT_CODES.includes(e.code)) return 'unsent';
  }
  return null;
}
/** THE ONE-SHOT REQUEST BODY (lane judge-one-shot-body) — ONE implementation for both vendor callers of the Decision API
 *  row (the judge's decisions request, the text client's chat completions). `bytes` = the request serialized ONCE (a
 *  Uint8Array — anything else throws, so nothing is sent); the answer is a stream that hands them over once and has no
 *  SOURCE, so the platform can never send them again. Node's fetch re-sends a body that has a source (a string, bytes,
 *  a Buffer, a Blob) on an HTTP 421 over a new connection: empty, but with every header, the key included — a second
 *  request (measured on Node 24: lane rule-learning-fix-r2, and judge-one-shot-body for all four shapes). The caller
 *  sends it with `duplex: 'half'` and its own `content-length` (the framing a string had: never chunked). */
function oneShotBody(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('oneShotBody takes the serialized request bytes');
  return new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
}
/** A 429's Retry-After (delta seconds or an HTTP date) in ms from `now`; null when absent / unreadable / past. */
function retryAfterMs(header, now = 0) {
  const h = String(header === null || header === undefined ? '' : header).trim();
  if (!h) return null;
  const ms = /^\d+$/.test(h) ? Number(h) * 1000 : Date.parse(h) - Number(now);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
/** A wall (429 / 5xx / a network failure): 1 min, then 5, then 15 (and stays 15) until a success resets the step;
 *  a 429 that says Retry-After waits exactly that (≤ 1 h). → {step, until}. Never a retry into the wall: the engine
 *  simply answers `backoff` until then. */
function nextBackoff(prev = {}, now = 0, outcome = 'wall', { retryAfter = null } = {}) {
  if (outcome !== 'wall') return { step: 0, until: 0 };
  const step = Math.min(BACKOFF_MS.length, (Number(prev.step) || 0) + 1);
  const wait = Number(retryAfter) > 0 ? Math.min(Math.max(Number(retryAfter), 1000), RETRY_AFTER_MAX_MS) : BACKOFF_MS[step - 1];
  return { step, until: Number(now) + wait };
}
const isWall = (status) => status === 429 || (status >= 500 && status <= 599) || status === 0;
/** The provider refused the KEY: the row needs a new one (the card says Reconnect) — no call until the key changes. */
const isKeyRefused = (status) => status === 401 || status === 403;
/** A ROW STOP (lane decision-vendor-hygiene, B-2979): an answer that would be the same for every record until the owner
 *  changes the key or the model — 401 / 403 the key (`reconnect`), 402 the plan (`plan`: payment required — the plan
 *  does not allow this model), 400 the request's shape (`shape`: the model refused it; measured 2026-10-12, two models
 *  answered 400 to every call). The engine makes no call until the key, the provider or the model changes (or the
 *  owner's Test answers 200) — never one call a record. Any other 4xx stays a per-call error. → why ∈ ROW_STOPS | null. */
const ROW_STOPS = Object.freeze(['reconnect', 'plan', 'shape']);
const rowStopOf = (status) => (isKeyRefused(status) ? 'reconnect' : status === 402 ? 'plan' : status === 400 ? 'shape' : null);

/** A journal line: a fixed field list (no key, no text of anyone's) — the key only as its 6-character fingerprint. */
// + `p` (lane decision-attention-facts): an attention call's needs_now, 2 decimals — the next quality check needs no memo join
// + `zdr` (lane rule-learning): a text-model call says it went through the zero-data-retention routing (always true — no other is sent)
const JOURNAL_FIELDS = Object.freeze(['at', 'use', 'memo', 'dialect', 'model', 'outcome', 'why', 'status', 'inputTokens', 'outputTokens', 'reserved', 'usd', 'est', 'truncated', 'n', 'keyFp', 'rubric', 'hits', 'p', 'zdr']);
function journalRow(o = {}) {
  const row = {};
  for (const k of JOURNAL_FIELDS) {
    let v = o[k];
    if (v === undefined || v === null) continue;
    if (k === 'keyFp') v = str(v).slice(0, 6);
    else if (k === 'memo') v = str(v).slice(0, 16);
    else if (k === 'p') { if (prob(v) === null) continue; v = Math.round(v * 100) / 100; }
    else if (typeof v === 'string') v = v.slice(0, 64);
    row[k] = v;
  }
  return row;
}

// ── the rubric v2 (design §2.4; v2 = lane decision-attention-facts, 2026-10-13) ─────────────────────────────
// v1 → v2: `to_me` reads the FACTS LINE (the input never said who the reader is, so "addressed to the reader" was a guess
// and a real @-mention scored 0.15); `matters` is asked ONLY when the person's block is non-empty (with it empty 140 of
// 145 answers were 0.4–0.5); the state's [rubric] part is ONE line (the questions carry their own instructions — the
// full text rode twice, ≈ 13 % of a call). The memo key carries the version: every row is judged once more.
const clause = (name, word, instructions, threshold = 0.6) => Object.freeze({ name, word, instructions, threshold, type: 'predicate' });
const RUBRIC = Object.freeze({
  version: 2,
  needsNow: clause('needs_now', 'needs you now', 'Does this conversation need the reader\'s attention now — a reply, a decision or an action from them, soon?', THRESHOLD_DEFAULT),
  clauses: Object.freeze([
    clause('to_me', 'said to you', 'Is the latest message addressed to the reader? The facts line states an @-mention, a direct message or a reply to the reader; otherwise judge from the text.'),
    clause('asks_me', 'asks you', 'Does the latest message ask the reader a question or ask them to do something?'),
    clause('decision', 'wants your decision', 'Does someone need the reader to decide, approve or sign off on something?'),
    clause('deadline_money', 'deadline or money', 'Does the conversation mention a deadline, a due date, a payment, an invoice or an amount of money that concerns the reader?'),
    clause('waiting', 'someone is waiting', 'Is someone waiting on the reader (blocked, following up, or asking again)?'),
    clause('escalation', 'escalation', 'Is this an escalation, a complaint, an outage or an incident?'),
    clause('matters', 'what you care about', 'Does it match what the reader said they care about (the reader block above)?'),
  ]),
});
/** The clauses asked: `matters` only when the person's block says something (`hasBlock`) — never a question about an empty block. */
const rubricClauses = ({ hasBlock = false } = {}) => RUBRIC.clauses.filter((c) => hasBlock || c.name !== 'matters');
const rubricQuestions = ({ hasBlock = false } = {}) => [RUBRIC.needsNow, ...rubricClauses({ hasBlock })].map((c) => ({ type: 'predicate', name: c.name, instructions: c.instructions }));
/** The state's [rubric] part — ONE line (each question carries its own instructions; v1 sent the whole rubric here too). */
const rubricText = ({ hasBlock = false } = {}) => `Rubric v${RUBRIC.version} — answer each question for the reader; the facts line is measured by the product, trust it over the text.${hasBlock ? ' The [userBlock] part is the reader\'s own words on what matters to them.' : ''}`;
/** THE VERDICT of the attention use: needs_now ≥ threshold ⇒ judged; the REASON = the rubric clauses whose own
 *  predicate reached its threshold, as {name, word} from OUR table (the client words them). A refused or
 *  missing needs_now is no verdict. */
function attentionVerdict(answers, threshold = THRESHOLD_DEFAULT, { hasBlock = true } = {}) {
  const by = new Map((answers || []).map((a) => [a.name, a]));
  const n = by.get('needs_now');
  if (!n || n.refused || prob(n.probability) === null) return { judged: false, p: null, clauses: [], why: 'no-answer' };
  const clauses = rubricClauses({ hasBlock }).filter((c) => { const a = by.get(c.name); return a && !a.refused && prob(a.probability) !== null && a.probability >= c.threshold; }).map((c) => ({ name: c.name, word: c.word }));
  return { judged: n.probability >= threshold, p: n.probability, clauses };
}
// THE GOLDEN SET: one sentence each way per clause (the probe measures agreement on them; the suite pins the
// reason rule over fixed answers).
const GOLDEN = Object.freeze([
  { text: 'Hi Sam, can you approve the Q3 budget by Friday? Finance is waiting on you.', expect: { needs_now: true, to_me: true, asks_me: true, decision: true, deadline_money: true, waiting: true, escalation: false } },
  { text: 'FYI the office plants were watered today.', expect: { needs_now: false, to_me: false, asks_me: false, decision: false, deadline_money: false, waiting: false, escalation: false } },
  { text: 'The checkout service is down for every customer — this is the third complaint today.', expect: { needs_now: true, escalation: true, deadline_money: false } },
  { text: 'Following up again: I still need the signed contract from you before I can ship.', expect: { needs_now: true, waiting: true, asks_me: true } },
]);

/** THE CANDIDATE CATALOGUE of the "draft from my verdicts" button (§2.3) — each a predicate we wrote. */
const CRITERIA_CATALOGUE = Object.freeze([
  ['reply_asked', 'Messages that ask me to reply'], ['due_date', 'Messages with a due date or deadline'], ['money', 'Messages about money, invoices or payments'],
  ['waiting_on_me', 'Someone waiting on me'], ['complaint', 'Escalations and complaints'], ['my_name', 'Messages that use my name'],
  ['my_projects', 'Projects I own'], ['approval', 'Requests for my approval'], ['meeting', 'Meeting requests and changes'],
  ['customer', 'Messages from customers'], ['manager', 'Messages from my manager'], ['incident', 'Outages and incidents'],
  ['contract', 'Contracts and legal documents'], ['hiring', 'Hiring and candidates'], ['security', 'Security alerts and access requests'],
  ['newsletter', 'Newsletters and announcements'], ['automated', 'Automated notifications'], ['social', 'Social chatter'],
  ['question', 'Direct questions'], ['urgent_word', 'Messages marked urgent or ASAP'],
].map(([name, text]) => Object.freeze({ name, text, type: 'predicate', instructions: `Is this one of: ${text.toLowerCase()}?` })));
/** PROPOSES the catalogue clauses that best separate the person's labeled examples: `labeled[i].verdict`
 *  ('needs' | 'not') with `answers[i]` = that example's catalogue answers. Separation = mean p over 'needs' −
 *  mean p over 'not' (a negative separation proposes "not …" lines). → {lines: [{name, text, separation}],
 *  text, applied: false} — never applied: the lines go into the person's own box for them to edit. */
function criteriaProposal(labeled, answers, { max = 4, min = 0.25 } = {}) {
  const rows = (labeled || []).map((l, i) => ({ v: l && l.verdict, a: new Map(((answers || [])[i] || []).filter((x) => !x.refused).map((x) => [x.name, x.probability])) }));
  const need = rows.filter((r) => r.v === 'needs'), not = rows.filter((r) => r.v === 'not');
  if (!need.length || !not.length) return { lines: [], text: '', applied: false, why: 'need-both-labels' };
  const mean = (rs, k) => { const ps = rs.map((r) => r.a.get(k)).filter((p) => prob(p) !== null); return ps.length ? ps.reduce((s, p) => s + p, 0) / ps.length : null; };
  const scored = CRITERIA_CATALOGUE.map((c) => { const a = mean(need, c.name), b = mean(not, c.name); return { name: c.name, text: c.text, separation: a === null || b === null ? 0 : a - b }; })
    .filter((x) => Math.abs(x.separation) >= min).sort((x, y) => Math.abs(y.separation) - Math.abs(x.separation) || x.name.localeCompare(y.name)).slice(0, max)
    .map((x) => ({ ...x, separation: Math.round(x.separation * 100) / 100, text: x.separation < 0 ? `Not: ${x.text.toLowerCase()}` : x.text }));
  return { lines: scored, text: scored.map((x) => x.text).join('\n'), applied: false };
}

// ── the attention use: its record parts, the verdict a row keeps, the learned examples (lane decision-attention, D2 —
// design §2.3 / §2.4; the scan is src/server/channels-attention.js, the tag is src/channel-focus.js `judgedTag`) ──
const ATTENTION_THRESHOLD_RANGE = Object.freeze([0.5, 0.9]);   // the setting `decision.threshold` (the rules' own range is THRESHOLD_RANGE)
const USER_BLOCK_MAX = 1500;     // the person's "what matters to me" block — their words, never rewritten, only bounded
const EXAMPLES_KEPT = 200;       // data/decision-examples.json keeps the newest 200
const EXAMPLES_SENT = 12;        // a scan's input carries the newest 12
const EXAMPLE_DIGEST_MAX = 200;  // an example's record digest, in characters
const VERDICTS = Object.freeze(['needs', 'not']);
/** The attention threshold of the setting: a number inside the range, else the default. */
function attentionThreshold(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= ATTENTION_THRESHOLD_RANGE[0] && n <= ATTENTION_THRESHOLD_RANGE[1] ? n : THRESHOLD_DEFAULT;
}
const userBlockOf = (v) => str(v).slice(0, USER_BLOCK_MAX);

// ── the facts line (lane decision-attention-facts, owner 2026-10-13: 「decision api给的优先级评估都不怎么样」) ──
// What the PRODUCT already measured, worded in the rubric's language, FIRST in the record: the judge was handed text
// only, so "is this addressed to the reader" was a guess. The engine computes `ctx` from what it holds (the at-you
// rule's predicate, the row's kind, `touch.selfAt`, the read line, the gmail adapter's `automated` fact, the
// duplicate-inbox map built once per scan); this words ONLY the facts that apply and NEVER a name, an id or an address
// — counts, kinds and ages (the census in test-decision-model ⑬ feeds a view whose every field is a name or an id).
const UNREAD_SENT = 12;          // the body when the read line is known: the messages past it, newest first, at most 12
const TAIL_SENT = 8;             // … when it is unknown: the last 8 (as v1)
const INBOX_DUP_MS = 60 * 60e3;  // one mail in K inboxes: same subject + sender within an hour (the owner's 3-copy Workspace notice spans 22 min)
const IMPLICIT_MS = 24 * 3600e3; // an implicit label's window: a reply within 24 h of the verdict / 24 h unopened after it
const ADDRESSED = Object.freeze({ mention: '@-mentioned the reader', direct: 'a direct message', reply: 'a reply to the reader\'s message', none: 'no mention of the reader' });
const AUTOMATED = Object.freeze(['auto-reply', 'bulk', 'notification']);   // the gmail adapter's `automated` levels (src/channel-record.js)
const count = (n) => (Number.isInteger(n) && n >= 0 ? n : null);
/** The `automated` level a stored record's facts carry (the gmail adapter's Auto-Submitted / Precedence reading), else
 *  null — read HERE so the engine's facts path stays kind-free (test-channel-facts V7). */
function automatedOf(facts) {
  const f = (Array.isArray(facts) ? facts : []).find((x) => x && x.k === 'automated');
  return f && AUTOMATED.includes(f.v) ? f.v : null;
}
/** An age in the line's words: "5 min", "2 h", "3 d". */
function ageWords(ms) {
  const m = Math.max(0, Number(ms) || 0) / 60e3;
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  const h = m / 60;
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
}
/** THE FACTS LINE of one row. `ctx` = {now, mentioned, replyToSelf, dm, app, members, mail, selfAt (null = unknown, 0 = none
 *  on record — the engine stamps it as records arrive and heals an old row from its last 200, so 0 is "not lately", never
 *  a proven "never"), readAt (0 = unknown), unread, inboxes, automated} — every field a flag, a count or an instant. */
function attentionFacts(view, ctx = {}) {
  const v = view || {}, c = ctx || {};
  const t = Number(c.now) || 0;
  const dm = typeof c.dm === 'boolean' ? c.dm : v.kind === 'dm', app = typeof c.app === 'boolean' ? c.app : !!v.app;
  const out = [`addressed: ${ADDRESSED[c.mentioned ? 'mention' : dm && !app ? 'direct' : c.replyToSelf ? 'reply' : 'none']}`];
  const members = count(c.members);
  out.push(`kind: ${dm ? (app ? 'a direct message from an app' : 'a direct message') : c.mail ? 'an email thread' : members !== null ? `a group of ${members}` : 'a group'}`);
  if (t && c.selfAt !== null && c.selfAt !== undefined) out.push(Number(c.selfAt) > 0 ? `the reader last spoke here ${ageWords(t - Number(c.selfAt))} ago` : 'the reader has not spoken here lately');
  if (t && Number(c.readAt) > 0) { const n = count(c.unread) || 0; out.push(`${n} message${n === 1 ? '' : 's'} since the reader last read, ${ageWords(t - Number(c.readAt))} ago`); }
  const k = count(c.inboxes);
  if (k !== null && k >= 2) out.push(`the same message reached ${k} of the reader's inboxes`);
  if (AUTOMATED.includes(c.automated)) out.push(`an automated or bulk sender (${c.automated})`);
  return out.join('; ');
}
/** The duplicate-inbox map's key of a mail row: its subject (Re: / Fwd: prefixes, case and spacing folded) + the
 *  sender's display name — '' when either is missing (never counted). */
function inboxKey(title, sender) {
  let t = str(title).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  for (let i = 0; i < 5; i++) { const m = /^(?:re|fwd?|fw|aw|回复|答复|转发)\s*[:：]\s*/.exec(t); if (!m) break; t = t.slice(m[0].length); }
  const s = str(sender).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  return t && s ? `${t.slice(0, 300)}|${s.slice(0, 100)}` : '';
}
/** How many of the owner's inboxes got it: the distinct accounts among `seen` ([{adapterId, lastAt}] under one key)
 *  whose row moved within `windowMs` of this one's — this row's own account included. */
function inboxCount(seen, adapterId, lastAt, windowMs = INBOX_DUP_MS) {
  const ids = new Set([adapterId]);
  for (const x of Array.isArray(seen) ? seen : []) if (x && Math.abs((Number(x.lastAt) || 0) - (Number(lastAt) || 0)) <= windowMs) ids.add(x.adapterId);
  return ids.size;
}
/** A MAIL BODY TRIMMED before the cut (gmail records only — never chat text): the quoted earlier mail from its
 *  "On … wrote:" / "在 … 写道：" header to the end, `>` lines, the signature from the `-- ` marker, a footer from the
 *  first unsubscribe / "You have received this" / "You are receiving this" / © line that starts past 40 % of the text
 *  (a notice's opening "You are receiving this…" stays), blank runs folded. Never trimmed to nothing. */
const FOOTER_RE = /unsubscribe|you have received this|you are receiving this|^\s*©/i;
function trimMailBody(text) {
  const src = str(text);
  let lines = src.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i].trim(), two = i + 1 < lines.length && a.length < 300 ? `${a} ${lines[i + 1].trim()}` : a;
    const head = (/^On\s/.test(a) && (/\swrote:$/.test(a) || /\swrote:$/.test(two))) || (/^在/.test(a) && (/写道[:：]$/.test(a) || /写道[:：]$/.test(two)));
    if (head) { lines = lines.slice(0, i); break; }
  }
  lines = lines.filter((l) => !/^\s*>/.test(l));
  const sig = lines.findIndex((l) => /^--\s?$/.test(l));
  if (sig >= 0) lines = lines.slice(0, sig);
  const total = lines.join('\n').length;
  for (let i = 0, at = 0; i < lines.length; at += lines[i].length + 1, i++) if (at > total * 0.4 && FOOTER_RE.test(lines[i])) { lines = lines.slice(0, i); break; }
  const out = lines.map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return out || src.trim();
}
/** THE RECORD PARTS of one first-screen row (a rowView): the facts line (FIRST), title, the account, the newest
 *  message's sender (a display name — never the owner), the body. `tail` oldest → newest: {who, text, self, agent, at};
 *  an agent's reply is marked `agent:`, the owner's `me:`. THE BODY = what the reader has not read: with the read line
 *  known (`since`) the messages past it NEWEST FIRST, at most 12 and only whole messages that fit the record ceiling,
 *  then "(N earlier unread messages omitted)" when cut (`unread` = the row's own count, which knows the messages the
 *  bounded read never reached); else the last 8 as v1; else the row's last line. `mail` ⇒ each text `trimMailBody`. */
function attentionRecord(view, tail = [], facts = '', { since = 0, unread = 0, mail = false } = {}) {
  const v = view || {};
  const w = v.lastWho && typeof v.lastWho === 'object' ? v.lastWho : null;
  const head = { facts: str(facts), title: str(v.title), source: str(v.adapterLabel), sender: w && !w.self ? str(w.name) : '' };
  const all = (Array.isArray(tail) ? tail : []).filter((r) => r && str(r.text).trim());
  const said = (r) => `${r.self ? 'me' : r.agent ? 'agent' : str(r.who).slice(0, 80) || 'someone'}: ${mail ? trimMailBody(r.text) : str(r.text)}`;
  const line = Number(since) || 0;
  const fresh = line > 0 ? all.filter((r) => Number(r.at) > line) : [];
  if (!fresh.length) {
    const lines = all.slice(-TAIL_SENT).reverse().map(said);
    return { ...head, body: lines.length ? lines.join('\n') : str(v.lastText) };
  }
  const plan = PLANS.attention, bodyMax = plan.variable.find((p) => p.name === 'body').max - 64;
  const room = plan.recordCeiling - estTokens(Object.values(head).join('\n')) - 48;   // tokens left for the body (+ the omitted line)
  const lines = [];
  for (const r of fresh.slice(-UNREAD_SENT).reverse()) {
    const next = [...lines, said(r)].join('\n');
    if (lines.length && (estTokens(next) > room || next.length > bodyMax)) break;
    lines.push(said(r));
  }
  const omitted = Math.max(fresh.length, count(unread) || 0) - lines.length;
  if (omitted > 0) lines.push(`(${omitted} earlier unread message${omitted === 1 ? '' : 's'} omitted)`);
  return { ...head, body: lines.join('\n') };
}
/** The verdict a row keeps: {p, clauses: [name], rubricV, lastAt, source} — threshold-free (the row's tag applies
 *  the CURRENT setting); null when needs_now was refused or missing. */
/** HITS (lane plugins-panel-grammar — the card's 「命中 m 条」): how many of one attention call's records the verdict
 *  marks "needs you now" at the row's threshold. `perRecord` = one answers list per record (a batch unbatched). */
function attentionHits(perRecord, threshold = THRESHOLD_DEFAULT) {
  return (Array.isArray(perRecord) ? perRecord : []).reduce((m, a) => m + (attentionVerdict(a, attentionThreshold(threshold)).judged ? 1 : 0), 0);
}
function judgedOf(answers, lastAt, { hasBlock = true } = {}) {
  const v = attentionVerdict(answers, 1, { hasBlock });
  return v.p === null ? null : { p: v.p, clauses: v.clauses.map((c) => c.name), rubricV: RUBRIC.version, lastAt: Number(lastAt) || 0, source: 'judge' };
}
/** A LABELED EXAMPLE {key, lastAt, snippet, verdict, clauses, at}: the record's digest (title — the newest line,
 *  ≤ 200 characters, cleaned like every part on its way out), the person's verdict, the clauses the judge had named. */
function exampleOf(rec, verdict, clauses = [], at = 0, { source = null } = {}) {
  if (!VERDICTS.includes(verdict)) throw new Error('a label is needs or not');
  const r = rec || {};
  const snippet = cleanPart([str(r.title), str(r.body).split('\n')[0]].filter(Boolean).join(' — '), EXAMPLE_DIGEST_MAX, 'line');
  const names = new Set(RUBRIC.clauses.map((c) => c.name));
  return { key: str(r.key).slice(0, 300), lastAt: Number(r.lastAt) || 0, snippet, verdict, clauses: (Array.isArray(clauses) ? clauses : []).filter((c) => names.has(c)), at: Number(at) || 0, ...(source === 'implicit' ? { source: 'implicit' } : {}) };
}
const isImplicit = (x) => !!x && x.source === 'implicit';
/** The store after a label: NEWEST FIRST, one example per record (a new label replaces its older one), ≤ max. An
 *  IMPLICIT example never replaces the person's own for the same record; over the cap the oldest implicit one goes first. */
function addExample(list, ex, max = EXAMPLES_KEPT) {
  const prev = Array.isArray(list) ? list : [];
  if (isImplicit(ex) && prev.some((x) => x && x.key === ex.key && !isImplicit(x))) return prev.slice(0, max);
  const out = [ex, ...prev.filter((x) => x && x.key !== ex.key)];
  while (out.length > max) { let i = out.length - 1; while (i > 0 && !isImplicit(out[i])) i--; out.splice(i > 0 ? i : out.length - 1, 1); }
  return out;
}
/** What an input carries: the person's own labels FIRST (the newest ≤ n, oldest first among them), then the implicit
 *  ones fill the slots left (marked `inferred`) — the plan keeps the LAST of the list it is handed, ≤ n in all.
 *  `{clauses: true}` (lane rule-learning — the block drafter): each also carries the clause names the judge had named. */
function examplesForInput(list, n = EXAMPLES_SENT, { clauses = false } = {}) {
  const all = Array.isArray(list) ? list : [];
  const mine = all.filter((x) => x && !isImplicit(x)).slice(0, n);
  const inferred = all.filter(isImplicit).slice(0, Math.max(0, n - mine.length));
  const named = (x) => (clauses ? { clauses: Array.isArray(x.clauses) ? x.clauses.slice() : [] } : {});
  return [...mine.reverse().map((x) => ({ snippet: x.snippet, verdict: x.verdict, ...named(x) })), ...inferred.reverse().map((x) => ({ snippet: x.snippet, verdict: x.verdict, inferred: true, ...named(x) }))];
}
/** AN IMPLICIT LABEL off what the owner did (the switch `decision.implicitLabels`, off by default): 'needs' when they
 *  replied after the judged message within 24 h of the verdict (`row.selfAt`); 'not' when a row judged at or above the
 *  threshold stayed unopened (`row.readAt` short of the message) and unanswered for 24 h after it; null = nothing (yet).
 *  `v` = the kept verdict {p, lastAt, at (when it was judged)}. */
function implicitLabel(v, row, now = 0, threshold = THRESHOLD_DEFAULT) {
  if (!v || !row || !(Number(v.at) > 0) || prob(v.p) === null) return null;
  const lastAt = Number(v.lastAt) || 0, at = Number(v.at), selfAt = Number(row.selfAt) || 0, readAt = Number(row.readAt) || 0;
  if (selfAt > lastAt) return selfAt - at <= IMPLICIT_MS ? 'needs' : null;
  return v.p >= threshold && now - at >= IMPLICIT_MS && readAt < lastAt ? 'not' : null;
}
/** The journal's `p`: an answers list's needs_now probability (undefined when refused / missing). */
function needsNowP(answers) {
  const a = (Array.isArray(answers) ? answers : []).find((x) => x && x.name === 'needs_now');
  return a && !a.refused && prob(a.probability) !== null ? a.probability : undefined;
}
/** The catalogue as questions (the "draft from my decisions" button asks them of each example). */
const criteriaQuestions = () => CRITERIA_CATALOGUE.map((c) => ({ type: 'predicate', name: c.name, instructions: c.instructions }));

// ── use ④: the For-you tray's sections (lane inbox-decision-group, design §2.6 row 「For-you 托盘分组」 + §2.10 ④) ──
// v2 (lane decision-inbox-rank, decision-quality findings §二, 2026-10-13: 25 of 34 items in 「现在要你」, a 14-day-old
// ask at p 1.0): v1's one score question defined `now` as "an agent waits on your decision", and every For-you item is
// one. v2 hands the judge the hub's own FACTS (how long ago, what the agent did since, a named date, re-asks), asks ONE
// choice of three, and PURE rules overrule it (the decay, a blocked fact) and order the sections. The item's own urgency
// is the agent's declaration and is never written; the card's words are OURS (src/lib/user-todos-row.js through t()).
const INBOX = Object.freeze({
  version: 2,
  minAgeMs: 60 * 1000,                 // the For-you rule: an ask nobody answered in a minute
  passMs: 5 * 60 * 1000,               // a pass every 5 minutes, off every wake path
  decayMs: 48 * 60 * 60 * 1000,        // THE DECAY: 48 h since the last ask, no progress after it, no live date ⇒ 「可以等」
  linkMs: 10 * 60 * 1000,              // a blocked status set ≤ 10 min after the ask is THAT ask's; activity later than that is the agent going on
  choices: Object.freeze([
    Object.freeze({ value: 'blocked', group: 'now', description: 'The agent cannot go on without the reader\'s answer and is waiting now.' }),
    Object.freeze({ value: 'dated', group: 'now', description: 'The reader must act by a named date or time.' }),
    Object.freeze({ value: 'whenever', group: 'later', description: 'The agent continued on a default, finished, or only needs the reader\'s eventual word: a notice, a report, a question with no clock.' }),
  ]),
});
const INBOX_QUESTION = Object.freeze({ type: 'choice', name: 'inbox_need', instructions: 'What does the agent that filed this item need from the reader? Read the facts line first: it is the hub\'s own record.', choices: INBOX.choices.map((c) => ({ value: c.value, description: c.description })) });
const inboxLevelsText = () => `Choices v${INBOX.version}: ${INBOX.choices.map((c) => c.value).join(' | ')} (the question describes each). Sort the For-you item below. Its facts line (age, what the agent did since the ask, a named date, re-asks) is the hub's own record: trust it over the item's words.`;
/** Does the tray's judge sort this item at all? An OPEN action item of NORMAL urgency (a missing urgency is normal) with
 *  no option chips and no producer buttons (an item that carries its answers is a decision already) and no reply yet.
 *  → true | the reason it is not (a word). */
function inboxSorts(item) {
  const i = item || {};
  if (i.status !== 'open') return 'not-open';
  if (i.kind === 'notice') return 'notice';
  if ((i.urgency || 'normal') !== 'normal') return 'urgency';
  if ((Array.isArray(i.options) && i.options.length) || i.action) return 'answers';
  if (i.reply) return 'answered';
  return true;
}
/** May the judge score this item NOW? It sorts (above), it was filed at least a minute ago, the rules do not place it
 *  already (`facts`: a blocked fact or the decay — those cost no call), and it was never scored under this table with
 *  these facts (a new state, date or re-ask is judged again). → true | the reason it is not (a word). */
function inboxEligible(item, now = 0, facts = null) {
  const i = item || {};
  const s = inboxSorts(i);
  if (s !== true) return s;
  if (!(Number(now) - (Number(i.createdAt) || 0) >= INBOX.minAgeMs)) return 'young';
  if (facts && (facts.state === 'blocked' || inboxStale(facts, now))) return 'placed';
  if (i.judged && i.judged.v === INBOX.version && (!facts || i.judged.sig === inboxFactsSig(facts))) return 'scored';
  return true;
}

// THE DATE TABLE — conservative: a phrase that names WHEN (a bare number never counts; 上周五 is past). Rows → a kind
// the resolver knows; tokens ≤ 4 characters apart (a space, a comma, "at") are ONE phrase (「今晚 22:00」, "by Friday 5pm").
const DATE_TABLE = Object.freeze([
  ['iso', /\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g],
  ['md', /(?<![\d/.:-])(?:(1[0-2]|0[1-9])\/(3[01]|[12]\d|0?[1-9])|([1-9])\/(3[01]|[12]\d|0[1-9]))(?![\d/])/g],   // 10/13, 1/15 — never 1/2 (a fraction)
  ['hm', /(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])(?:\s?(am|pm)\b)?(?:\s?(?:PT|PST|PDT|ET|UTC)\b)?/gi],
  ['hap', /(?<![\d:.])(1[0-2]|[1-9])\s?(am|pm)\b/gi],
  ['day', /今晚|今夜|明早|明晚|明天|明日|后天|\btonight\b|\btomorrow\b|\bEOD\b|\bend of (?:the )?day\b/gi],
  ['weekday', /(?<!上)(下)?(?:周|星期|礼拜)([一二三四五六日天])|\bby (mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b/gi],
  ['month-end', /月底|\bend of (?:the )?month\b/gi],
  ['mark', /截止|\bdeadline\b/gi],
]);
const WEEKDAY = Object.freeze({ 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 });
const DAY_MS = 24 * 60 * 60 * 1000;
const localOf = (ms, off) => { const x = new Date(Number(ms) - off * 60000); return { y: x.getUTCFullYear(), mo: x.getUTCMonth(), d: x.getUTCDate(), dow: x.getUTCDay() }; };
const atLocal = (y, mo, d, h, mi, off) => Date.UTC(y, mo, d, h, mi) + off * 60000;
/** The first phrase in `text` that names a date or a time (PURE): {phrase (≤ 40 characters, the text's own), due (ms —
 *  resolved against `base`, the ask, in the hub's zone `tzOffsetMin` (Date#getTimezoneOffset); a day without a time is
 *  its 23:59, a time alone is the ask's day or the next one) | null (截止 / deadline alone)} | null. */
function datePhraseOf(text, base = 0, tzOffsetMin = 0) {
  const s = str(text);
  if (!s) return null;
  const hits = [];
  for (const [kind, re] of DATE_TABLE) { re.lastIndex = 0; for (let m = re.exec(s); m && hits.length < 40; m = re.exec(s)) hits.push({ kind, m, start: m.index, end: m.index + m[0].length }); }
  if (!hits.length) return null;
  hits.sort((a, b) => (a.start - b.start) || (b.end - a.end));
  const run = [hits[0]];
  for (const h of hits.slice(1)) {
    const last = run[run.length - 1];
    if (h.start < last.end) continue;
    if (h.start - last.end > 4 || !/^(?:\s|,|，|、|at|@)*$/i.test(s.slice(last.end, h.start))) break;
    run.push(h);
  }
  const phrase = s.slice(run[0].start, run[run.length - 1].end).replace(/\s+/g, ' ').trim().slice(0, 40);
  const off = Number(tzOffsetMin) || 0, L = localOf(base, off);
  let day = null, hm = null;
  for (const { kind, m } of run) {
    if (kind === 'iso') day = [+m[1], +m[2] - 1, +m[3]];
    else if (kind === 'md') { const mo = +(m[1] || m[3]) - 1, d = +(m[2] || m[4]); day = [atLocal(L.y, mo, d, 23, 59, off) < Number(base) - 180 * DAY_MS ? L.y + 1 : L.y, mo, d]; }
    else if (kind === 'hm') hm = [m[3] ? (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0) : +m[1], +m[2]];
    else if (kind === 'hap') hm = [(+m[1] % 12) + (/pm/i.test(m[2]) ? 12 : 0), 0];
    else if (kind === 'day') day = [L.y, L.mo, L.d + (/后天/.test(m[0]) ? 2 : /明|tomorrow/i.test(m[0]) ? 1 : 0)];
    else if (kind === 'weekday') {
      const want = WEEKDAY[m[2] || String(m[3]).toLowerCase()];
      day = [L.y, L.mo, L.d + (m[1] ? 7 - ((L.dow + 6) % 7) + ((want + 6) % 7) : (want - L.dow + 7) % 7)];
    } else if (kind === 'month-end') day = [L.y, L.mo + 1, 0];
  }
  let due = null;
  if (day) due = atLocal(day[0], day[1], day[2], hm ? hm[0] : 23, hm ? hm[1] : 59, off);
  else if (hm) { due = atLocal(L.y, L.mo, L.d, hm[0], hm[1], off); if (due < Number(base)) due += DAY_MS; }
  return { phrase, due: Number.isFinite(due) ? due : null };
}

const BLOCKING = Object.freeze(['blocked', 'needs-input']);
const words = (s) => str(s).toLowerCase().replace(/\s+/g, ' ').trim();
/** Does a status sentence name THIS item? Its id, or the first 24 characters of its text (at least 8 of them). */
function refersTo(sentence, item) {
  const s = words(sentence), head = words(item && item.text).slice(0, 24);
  return !!s && ((!!(item && item.id) && s.includes(words(item.id))) || (head.length >= 8 && s.includes(head)));
}
/** THE FACTS of one item (PURE — the engine hands in `now`, the board's record of the item's conversation and the hub's
 *  zone): {state, dated, due, reasks, askedAt}. `board` = {status: vibespace-status's record {state, at, reason, detail}
 *  | null, history: its entries [{state, at, setBy}], progressAt: the conversation's newest vibespace-task progress note}.
 *  state: 'blocked' — the record says blocked / needs-input NOW and it is this ask's (set before the ask or ≤ linkMs
 *  after it, or its sentence names the item) | 'finished' — done since the ask | 'continued' — the agent set a status or
 *  posted progress after the ask (a non-blocking status at any time after it, anything later than linkMs after it) |
 *  'unknown'. askedAt = the last ask (a re-ask restarts the decay); dated / due = datePhraseOf the text, else the detail. */
function inboxFacts(item, { now = 0, board = null, tzOffsetMin = 0 } = {}) {
  const i = item || {};
  const askedAt = Math.max(Number(i.createdAt) || 0, Number(i.reaskedAt) || 0);
  const b = board || {}, st = b.status && typeof b.status === 'object' ? b.status : null;
  const hist = (Array.isArray(b.history) ? b.history : []).filter((h) => h && h.setBy === 'agent' && typeof h.state === 'string' && !h.event);
  const late = (at) => Number(at) > askedAt + INBOX.linkMs;
  let state = 'unknown';
  if (st && BLOCKING.includes(st.state)) {
    let since = Number(st.at) || 0;   // the start of the current blocked run (the history skips no-op repeats)
    for (let k = hist.length - 1; k >= 0 && BLOCKING.includes(hist[k].state); k--) since = Math.min(since, Number(hist[k].at) || since);
    if (since <= askedAt + INBOX.linkMs || refersTo(`${str(st.reason)} ${str(st.detail)}`, i)) state = 'blocked';
  }
  if (state === 'unknown') {
    if (st && st.state === 'done' && Number(st.at) > askedAt) state = 'finished';
    else if (hist.some((h) => Number(h.at) > askedAt && (late(h.at) || !BLOCKING.includes(h.state))) || late(b.progressAt)) state = 'continued';
  }
  const d = datePhraseOf(i.text, askedAt, tzOffsetMin) || datePhraseOf(i.detail, askedAt, tzOffsetMin);
  return { state, dated: d ? d.phrase : null, due: d ? d.due : null, reasks: Math.max(0, Math.floor(Number(i.reasks) || 0)), askedAt };
}
/** What a verdict was made under: the state, the date phrase, the re-asks (never the age — the decay owns the clock). */
const inboxFactsSig = (f) => (f ? [str(f.state), str(f.dated), Number(f.reasks) || 0].join('|') : '');
const agoWords = (ms) => { const m = Math.max(0, Math.round(Number(ms) / 60000)); return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`; };
const INBOX_STATE_LINE = Object.freeze({ blocked: 'the agent is blocked, waiting for this answer', continued: 'the agent continued on a default', finished: 'the agent finished', unknown: '' });
/** The facts as ONE English line for the judge — counts, kinds, ages and a quoted date phrase, never a name or an id. */
function inboxFactsLine(item, facts, now = 0) {
  const f = facts || {}, n = Number(f.reasks) || 0;
  const parts = [`asked ${agoWords(Number(now) - (Number(item && item.createdAt) || Number(f.askedAt) || 0))} ago`];
  if (INBOX_STATE_LINE[f.state]) parts.push(INBOX_STATE_LINE[f.state]);
  if (f.dated) parts.push(`a date or time is named: "${str(f.dated).slice(0, 40)}"`);
  if (n > 0) parts.push(`the item was re-asked ${n} time${n === 1 ? '' : 's'}, last ${agoWords(Number(now) - (Number(f.askedAt) || 0))} ago`);
  return parts.join(' · ');
}
/** THE INPUT of one item — the never-list by construction: ONLY its words (text, detail), the conversation's name and the
 *  facts line; never its artifacts, its reply, its action / card, nor any other item. */
const inboxScoreInput = (item, facts = null, now = 0) => ({ levels: inboxLevelsText(), facts: facts ? inboxFactsLine(item, facts, now) : '', text: str(item && item.text), detail: str(item && item.detail), session: str(item && item.sessionName) });
/** THE MEMO MATERIAL of one item (inbox-verify F2): its id + a DIGEST (16 hex of `sha`) of the words the judge reads —
 *  text + detail, cleaned and cut as the input cuts them — and the facts' signature, so a re-file / reopen / edit with
 *  new words, or a new state / date / re-ask, is a new key. */
function inboxMemoOf(item, sha, facts = null) {
  const cap = (n) => PLANS.inbox.variable.find((f) => f.name === n).max;
  const said = [cleanPart(item && item.text, cap('text')), cleanPart(item && item.detail, cap('detail'))];
  return { id: str(item && item.id), digest: String(sha(JSON.stringify(facts ? [...said, inboxFactsSig(facts)] : said))).slice(0, 16) };
}
/** The judge's choice → {group: 'now' | 'later', why: the chosen value, p: its probability (else the confidence) | null};
 *  a refused / missing / foreign answer is no verdict (null). */
function inboxVerdict(answer) {
  const a = answer || {};
  const c = !a.refused && INBOX.choices.find((x) => x.value === a.choice);
  if (!c) return null;
  const pr = a.probabilities || {};
  const p = prob(pr[c.value]) !== null ? pr[c.value] : prob(a.confidence);
  return { group: c.group, why: c.value, p: p === null ? null : Math.round(p * 1000) / 1000 };
}
/** (a) THE DECAY: 48 h since the last ask, no progress after it (continued / finished) and no live date (one still ahead,
 *  or passed less than 48 h ago) ⇒ the item can wait, whatever the judge said. PURE: `now` is handed in. */
function inboxStale(facts, now = 0) {
  const f = facts || {};
  if (f.state === 'continued' || f.state === 'finished') return false;
  if (!(Number(now) - (Number(f.askedAt) || 0) > INBOX.decayMs)) return false;
  return !(typeof f.due === 'number' && Number.isFinite(f.due) && Number(now) <= f.due + INBOX.decayMs);
}
/** ONE item's place in the tray (PURE; reads the item's declaration + `judged {group, why, p, facts}`, never its words):
 *  {section: 'now' | 'pending' | 'later', why: 'blocked' | 'dated' | 'whenever' | 'stale' | null, tier, due, p, askedAt}.
 *  The agent's declaration first (urgent / high and an item carrying its answers ⇒ now; low / answered ⇒ later), then the
 *  RULES THAT OVERRULE THE JUDGE — (a) the decay, (b) a blocked fact from the board — then the judge's choice (a v1 verdict
 *  keeps its group until v2 scores it again); no verdict ⇒ pending. */
function inboxPlace(item, now = 0) {
  const i = item || {}, u = i.urgency || 'normal';
  const j = i.judged && typeof i.judged === 'object' ? i.judged : {};
  const f = j.facts && typeof j.facts === 'object' ? j.facts : null;
  const base = { section: 'later', why: null, tier: 9, due: f && typeof f.due === 'number' && Number.isFinite(f.due) ? f.due : null, p: prob(j.p), askedAt: Math.max(Number(i.createdAt) || 0, f ? Number(f.askedAt) || 0 : 0) };
  if (u === 'urgent' || u === 'high') return { ...base, section: 'now', tier: u === 'urgent' ? 0 : 1 };
  if ((Array.isArray(i.options) && i.options.length) || i.action) return { ...base, section: 'now', tier: 3 };
  if (u !== 'normal' || i.reply) return base;
  if (f && inboxStale(f, now)) return { ...base, why: 'stale' };
  if (f && f.state === 'blocked') return { ...base, section: 'now', why: 'blocked', tier: 2 };
  const c = INBOX.choices.find((x) => x.value === j.why);
  if (c) return { ...base, section: c.group, why: c.value, tier: c.value === 'blocked' ? 2 : c.value === 'dated' ? 4 : 5 };
  if (j.group === 'now' || j.group === 'later') return { ...base, section: j.group, tier: 5 };
  return { ...base, section: 'pending' };
}
/** THE ORDER (PURE, `now` handed in): the items → [{id, section, why, …place}] sorted — 「现在要你」 first: urgent ›
 *  high › blocked (the oldest ask first) › decisions (options / buttons, newest first) › dated (the nearest date first, an
 *  unknown one after) › the rest by the judge's p (desc, then newest); then 「待判断」 and 「可以等」, newest first. */
const SECTION_ORDER = Object.freeze({ now: 0, pending: 1, later: 2 });
function inboxRank(items, now = 0) {
  const rows = (Array.isArray(items) ? items : []).filter((i) => i && i.id).map((i) => ({ id: i.id, ...inboxPlace(i, now) }));
  const newest = (a, b) => b.askedAt - a.askedAt;
  const due = (a, b) => (a.due === null) - (b.due === null) || (a.due !== null && b.due !== null ? a.due - b.due : 0);
  const inNow = (a, b) => (a.tier - b.tier) || (a.tier === 2 ? a.askedAt - b.askedAt : a.tier === 4 ? due(a, b) || (a.askedAt - b.askedAt) : a.tier === 5 ? ((b.p ?? -1) - (a.p ?? -1)) || newest(a, b) : newest(a, b));
  return rows.sort((a, b) => (SECTION_ORDER[a.section] - SECTION_ORDER[b.section]) || (a.section === 'now' ? inNow(a, b) : newest(a, b)));
}

// ── lane decision-spend-readout (owner 2026-10-13: 「看不到 decision api 花了多少钱了」) ─────────────────────────
// THE JUDGE'S MONEY IN ONE LINE: what the judge cost today, said the same way wherever the judge is named — the
// Plugins list row (a second line, never only the chip's title), the Settings budget row, the 需关注 block and
// Settings › Spending. Words go through the caller's `t` (the client's device words; a `{name}` filler stands in
// for a test). Money that moved is NEVER drawn as $0.00: under a cent with calls > 0 is 「< $0.01」.
const READOUT_WARN_AT = 0.9;                                   // ≥ 90 % of the day's cap ⇒ the line turns red
const READOUT_USES = Object.freeze(['attention', 'inbox', 'rule', 'routing', 'webhook', 'learn', 'test']);   // the title's order (+ learn: lane rule-learning)
const useWord = (k, t) => ({ attention: t('Needs attention'), inbox: t('For-you tray'), rule: t('Rules'), routing: t('Routing'), webhook: t('Webhooks'), learn: t('Block drafts'), test: t('Test') })[k] || k;
const fillWords = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(v, k) ? String(v[k]) : m));
const num0 = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
/** `$1.23` · `< $0.01` when anything moved under a cent · `$0` when nothing did. `fine` (the by-use title) keeps a
 *  tenth of a cent: `$0.009`, `< $0.001`. */
function moneyText(usd, moved = false, { fine = false } = {}) {
  const n = num0(usd);
  const floor = fine ? 0.001 : 0.01;
  if (n >= 0.01) return '$' + n.toFixed(2);
  if (fine && n >= floor) return '$' + n.toFixed(3);
  return n > 0 || moved ? `< $${floor}` : '$0';
}
/** decisionTodayLine(usage, capUsd, {on, t, monthUsd}) — `usage` = the engine's `today` ({byUse, total?, reserved?}) or
 *  data/decision-usage.json itself; `capUsd` = the plugin.decision-api.dailyBudgetUsd row. → `{on, calls, hits, spentUsd,
 *  capUsd, warn, money, cap, short, spend, text, title, month}`: `short` = the list row's second line, `text` = the full
 *  sentence, `spend` = its money half (for a line whose counts come from elsewhere), `title` = the by-use breakdown,
 *  `month` = 「Decision API · today … · this month …」 (Settings › Spending). Off ⇒ every string says so, never a number. */
function decisionTodayLine(usage, capUsd, { on = true, t = fillWords, monthUsd = null } = {}) {
  const u = usage && typeof usage === 'object' ? usage : {};
  const byUse = u.byUse && typeof u.byUse === 'object' ? u.byUse : {};
  const sum = (f) => Object.values(byUse).reduce((a, x) => a + num0(x && x[f]), 0);
  const calls = u.total && u.total.calls !== undefined ? num0(u.total.calls) : sum('calls');
  const spentUsd = (u.total && u.total.usd !== undefined ? num0(u.total.usd) : sum('usd')) + num0(u.reserved);
  const hits = sum('hits');
  const cap = Number.isFinite(Number(capUsd)) && Number(capUsd) >= 0 ? Number(capUsd) : DAILY_BUDGET_CENTS_DEFAULT / 100;
  if (!on) {
    const off = t('The Decision API is off — it spends nothing');
    return { on: false, calls: 0, hits: 0, spentUsd: 0, capUsd: cap, warn: false, money: '', cap: '', short: off, spend: off, text: off, title: '', month: off };
  }
  const moved = calls > 0 || spentUsd > 0;
  const money = moneyText(spentUsd, moved), capText = '$' + cap.toFixed(2);
  const warn = moved && (cap > 0 ? microUsd(spentUsd) >= microUsd(cap * READOUT_WARN_AT) : true);
  const spend = t('{spent} spent (limit {cap})', { spent: money, cap: capText });
  const title = READOUT_USES.filter((k) => byUse[k] || k === 'attention' || k === 'inbox' || k === 'rule')
    .map((k) => `${useWord(k, t)} ${moneyText(byUse[k] && byUse[k].usd, num0(byUse[k] && byUse[k].calls) > 0, { fine: true })}`).join(' · ');
  const mo = monthUsd === null || monthUsd === undefined ? null : Math.max(num0(monthUsd), spentUsd);
  return {
    on: true, calls, hits, spentUsd, capUsd: cap, warn, money, cap: capText, spend, title,
    short: t('Today {spent} / {cap} · judged {n} · hits {m}', { spent: money, cap: capText, n: calls, m: hits }),
    text: t('Today: judged {n} · {m} needed you', { n: calls, m: hits }) + ' · ' + spend,
    month: t('Decision API · today {spent} / {cap} · this month {month}', { spent: money, cap: capText, month: mo === null ? '—' : moneyText(mo, moved || mo > 0) }),
  };
}
/** The month so far from journal rows (data/decision-journal.jsonl, the caller's bounded tail): Σ usd of the rows whose
 *  local day starts with `month` ('YYYY-MM'). Malformed rows are skipped. → {usd, calls, days}. */
function monthSpend(rows, month, offsetMinOf = () => 0) {
  const days = new Set();
  let usd = 0, calls = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object' || !Number.isFinite(Number(r.at))) continue;
    const day = dayOf(r.at, offsetMinOf(Number(r.at)));
    if (day.slice(0, 7) !== month) continue;
    const v = num0(r.usd);
    if (v > 0 || r.outcome === 'ok') { usd += v; calls += 1; days.add(day); }
  }
  return { usd: Math.round(usd * 1e8) / 1e8, calls, days: days.size };
}

module.exports = {
  INBOX, INBOX_QUESTION, inboxLevelsText, inboxSorts, inboxEligible, inboxScoreInput, inboxVerdict, inboxMemoOf, datePhraseOf, inboxFacts, inboxFactsSig, inboxFactsLine, inboxStale, inboxPlace, inboxRank,   // lane inbox-decision-group (use ④) + lane decision-inbox-rank (v2)
  ATTENTION_THRESHOLD_RANGE, USER_BLOCK_MAX, EXAMPLES_KEPT, EXAMPLES_SENT, EXAMPLE_DIGEST_MAX, VERDICTS,   // lane decision-attention
  attentionThreshold, attentionHits, userBlockOf, attentionRecord, judgedOf, exampleOf, addExample, examplesForInput, criteriaQuestions,
  UNREAD_SENT, TAIL_SENT, INBOX_DUP_MS, IMPLICIT_MS, ADDRESSED, attentionFacts, ageWords, automatedOf, inboxKey, inboxCount, trimMailBody, implicitLabel, needsNowP, rubricClauses,   // lane decision-attention-facts
  QUESTION_TYPES, PROVIDERS, PROVIDER_LABEL, DEFAULT_MODEL, PRICE_PER_MTOK_USD, DAILY_BUDGET_CENTS_DEFAULT, THRESHOLD_DEFAULT, THRESHOLD_RANGE,
  BACKOFF_MS, RETRY_AFTER_MAX_MS, RATE_MIN_CALLS, MEMO_MAX, FEATURES, WHY, DIALECTS, USES, PLANS, NEVER, JOURNAL_FIELDS, RUBRIC, GOLDEN, CRITERIA_CATALOGUE,
  dialectOf, urlOf, questionError, buildRequest, normalizeAnswers, usageOf, estimateUsd, usdOf, estTokens, questionTokens,
  cutHeadTail, fitTokens, maskAddresses, eraseSecrets, scrub, cleanPart, scrubQuestions, inputPlan, buildInput, memoMaterial, memoKey, batchQuestions, unbatchAnswers,
  READOUT_WARN_AT, READOUT_USES, moneyText, decisionTodayLine, monthSpend,   // lane decision-spend-readout
  dayOf, rateOf, budgetVerdict, settleUsd, fetchFailOf, oneShotBody, retryAfterMs, nextBackoff, isWall, isKeyRefused, ROW_STOPS, rowStopOf, journalRow, rubricQuestions, rubricText, attentionVerdict, criteriaProposal,
};
