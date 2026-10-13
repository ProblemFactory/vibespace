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
 *  · `journalRow` — what a call leaves behind: never the key, never a text the vendor or a peer wrote;
 *  · RUBRIC v1 (needs_now + the seven clauses) — the REASON of a verdict is the clauses the decision itself
 *    selected (predicate ≥ the clause threshold), named through OUR word table; vendor prose has no field here;
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
const FEATURES = Object.freeze(['attention', 'rules', 'routing']);
const WHY = Object.freeze(['plugin-off', 'feature-off', 'no-key', 'account-never', 'reconnect', 'backoff', 'daily-budget', 'per-hour']);

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

// The plans — DATA (design §2.10's table): `fixed` parts first, `variable` (per record) last; caps in characters
// per part, ceilings in estTokens. `batch` = records per call — ONE for attention and every wake-path use (foryou's 10
// is the design's, unmeasured — a later use; the probe's lesson applies before it ships): the probe (2026-10-12, 20 records,
// openai/gpt-6-luna-decisions) measured batch-of-5 at 1 608 vs single 1 761 input tokens a record (9 % saved) but a
// needs_now agreement of only 12/20 at 0.7 (mean |Δp| 0.383) — batching changes verdicts, so the attention scan judges
// one record per call (many questions per record stay: batchQuestions); `memo` = what the memo key is made of.
const PART = (name, max, extra = {}) => Object.freeze({ name, max, ...extra });
const PLANS = Object.freeze({
  attention: Object.freeze({ fixed: [PART('rubric', 2400), PART('userBlock', 1500), PART('examples', 12 * 220, { each: 200, count: 12 })], variable: [PART('title', 200, { kind: 'line' }), PART('source', 200, { kind: 'line' }), PART('sender', 200, { kind: 'line' }), PART('body', 2048)], fixedCeiling: 1700, recordCeiling: 800, batch: 1, wakePath: false, memo: ['use', 'id', 'lastAt', 'rubric', 'userBlock', 'examples'] }),
  rule: Object.freeze({ fixed: [PART('condition', 500), PART('choices', 8 * 130, { each: 120, count: 8 })], variable: [PART('body', 2048), PART('thread', 3 * 320, { each: 300, count: 3 })], fixedCeiling: 500, recordCeiling: 1000, batch: 1, wakePath: true, memo: ['use', 'id', 'rule'] }),
  routing: Object.freeze({ fixed: [PART('condition', 500), PART('choices', 9 * 210, { each: 200, count: 9 })], variable: [PART('body', 2048), PART('thread', 3 * 320, { each: 300, count: 3 })], fixedCeiling: 800, recordCeiling: 1000, batch: 1, wakePath: true, memo: ['use', 'id', 'rule', 'groups'] }),
  foryou: Object.freeze({ fixed: [PART('levels', 600)], variable: [PART('text', 400), PART('detail', 800), PART('session', 200, { kind: 'line' })], fixedCeiling: 200, recordCeiling: 400, batch: 10, wakePath: false, memo: ['use', 'id', 'levels'] }),
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
const listPart = (v, each, count) => (Array.isArray(v) ? v : v ? [v] : []).slice(-count).map((x) => cleanPart(typeof x === 'object' && x ? [x.title, x.snippet || x.text, x.verdict ? `→ ${x.verdict}` : ''].filter(Boolean).join(' · ') : x, each, 'line')).filter(Boolean);
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
  return JSON.stringify(plan.memo.map((k) => (k === 'use' ? use : k === 'rubric' ? `v${RUBRIC.version}` : m[k] === undefined ? null : m[k])));
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
 *  provider refused, then the walls (a backoff names its end), then the money, then the hour. */
function budgetVerdict({ pluginOn = false, featureOn = false, keyPresent = false, accountNever = false, reconnect = false, backoffUntil = 0, now = 0,
  spentUsd = 0, estUsd = 0, ceilingCents = undefined, ceilingUsd = undefined, hourCount = 0, perHour = Infinity } = {}) {
  const cents = ceilingCents !== undefined ? Number(ceilingCents) : ceilingUsd !== undefined ? Number(ceilingUsd) * 100 : DAILY_BUDGET_CENTS_DEFAULT;
  const ceiling = (Number.isFinite(cents) && cents >= 0 ? cents : DAILY_BUDGET_CENTS_DEFAULT) / 100;
  if (!pluginOn) return { ok: false, why: 'plugin-off' };
  if (!featureOn) return { ok: false, why: 'feature-off' };
  if (!keyPresent) return { ok: false, why: 'no-key' };
  if (accountNever) return { ok: false, why: 'account-never' };
  if (reconnect) return { ok: false, why: 'reconnect' };
  if (Number(backoffUntil) > Number(now)) return { ok: false, why: 'backoff', retryAt: Number(backoffUntil) };
  if (microUsd(spentUsd) + microUsd(estUsd) > microUsd(ceiling)) return { ok: false, why: 'daily-budget', ceilingUsd: ceiling };
  if ((Number(hourCount) || 0) >= perHour) return { ok: false, why: 'per-hour' };
  return { ok: true, ceilingUsd: ceiling };
}
/** What a call finally costs (SETTLE replaces its reservation): an answered 4xx / 5xx = 0 (the provider refused or
 *  failed before judging — OpenAI and OpenRouter bill no error answer); the vendor's recorded `usage.cost` when it
 *  said one; else the larger of the reservation and the vendor's input tokens × price — a 200 without usage, a body
 *  that never parsed, a timeout or a dropped connection (status 0: it may have been judged) keep the reservation. */
function settleUsd({ status = 0, usage = null, reservedUsd = 0, pricePerMtok = PRICE_PER_MTOK_USD.openai } = {}) {
  if (status >= 400 && status <= 599) return 0;
  if (usage && usage.costUsd !== null && usage.costUsd !== undefined) return usage.costUsd;
  return microUsd(Math.max(Number(reservedUsd) || 0, estimateUsd(usage && usage.inputTokens, pricePerMtok))) / 1e8;
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

/** A journal line: a fixed field list (no key, no text of anyone's) — the key only as its 6-character fingerprint. */
const JOURNAL_FIELDS = Object.freeze(['at', 'use', 'memo', 'dialect', 'model', 'outcome', 'why', 'status', 'inputTokens', 'outputTokens', 'reserved', 'usd', 'est', 'truncated', 'n', 'keyFp', 'rubric']);
function journalRow(o = {}) {
  const row = {};
  for (const k of JOURNAL_FIELDS) {
    let v = o[k];
    if (v === undefined || v === null) continue;
    if (k === 'keyFp') v = str(v).slice(0, 6);
    else if (k === 'memo') v = str(v).slice(0, 16);
    else if (typeof v === 'string') v = v.slice(0, 64);
    row[k] = v;
  }
  return row;
}

// ── the rubric v1 (design §2.4) ───────────────────────────────────────────
const clause = (name, word, instructions, threshold = 0.6) => Object.freeze({ name, word, instructions, threshold, type: 'predicate' });
const RUBRIC = Object.freeze({
  version: 1,
  needsNow: clause('needs_now', 'needs you now', 'Does this conversation need the reader\'s attention now — a reply, a decision or an action from them, soon?', THRESHOLD_DEFAULT),
  clauses: Object.freeze([
    clause('to_me', 'said to you', 'Is the latest message addressed directly to the reader (by name, as a direct message, or as a reply to them)?'),
    clause('asks_me', 'asks you', 'Does the latest message ask the reader a question or ask them to do something?'),
    clause('decision', 'wants your decision', 'Does someone need the reader to decide, approve or sign off on something?'),
    clause('deadline_money', 'deadline or money', 'Does the conversation mention a deadline, a due date, a payment, an invoice or an amount of money that concerns the reader?'),
    clause('waiting', 'someone is waiting', 'Is someone waiting on the reader (blocked, following up, or asking again)?'),
    clause('escalation', 'escalation', 'Is this an escalation, a complaint, an outage or an incident?'),
    clause('matters', 'what you care about', 'Does it match what the reader said they care about (the reader block above)?'),
  ]),
});
const rubricQuestions = () => [RUBRIC.needsNow, ...RUBRIC.clauses].map((c) => ({ type: 'predicate', name: c.name, instructions: c.instructions }));
const rubricText = () => `Rubric v${RUBRIC.version}. Judge the record below for the reader. ${[RUBRIC.needsNow, ...RUBRIC.clauses].map((c) => `${c.name}: ${c.instructions}`).join(' ')}`;
/** THE VERDICT of the attention use: needs_now ≥ threshold ⇒ judged; the REASON = the rubric clauses whose own
 *  predicate reached its threshold, as {name, word} from OUR table (the client words them). A refused or
 *  missing needs_now is no verdict. */
function attentionVerdict(answers, threshold = THRESHOLD_DEFAULT) {
  const by = new Map((answers || []).map((a) => [a.name, a]));
  const n = by.get('needs_now');
  if (!n || n.refused || prob(n.probability) === null) return { judged: false, p: null, clauses: [], why: 'no-answer' };
  const clauses = RUBRIC.clauses.filter((c) => { const a = by.get(c.name); return a && !a.refused && prob(a.probability) !== null && a.probability >= c.threshold; }).map((c) => ({ name: c.name, word: c.word }));
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
/** THE RECORD PARTS of one first-screen row (a rowView): title, the account, the newest message's sender (a display
 *  name — never the owner), the body = the newest messages NEWEST FIRST (`tail` oldest → newest: {who, text, self,
 *  agent}; an agent's reply is marked `agent:`, the owner's `me:`), else the row's last line. */
function attentionRecord(view, tail = []) {
  const v = view || {};
  const lines = (Array.isArray(tail) ? tail : []).filter((r) => r && str(r.text).trim()).slice(-8).reverse()
    .map((r) => `${r.self ? 'me' : r.agent ? 'agent' : str(r.who).slice(0, 80) || 'someone'}: ${str(r.text)}`);
  const w = v.lastWho && typeof v.lastWho === 'object' ? v.lastWho : null;
  return { title: str(v.title), source: str(v.adapterLabel), sender: w && !w.self ? str(w.name) : '', body: lines.length ? lines.join('\n') : str(v.lastText) };
}
/** The verdict a row keeps: {p, clauses: [name], rubricV, lastAt, source} — threshold-free (the row's tag applies
 *  the CURRENT setting); null when needs_now was refused or missing. */
function judgedOf(answers, lastAt) {
  const v = attentionVerdict(answers, 1);
  return v.p === null ? null : { p: v.p, clauses: v.clauses.map((c) => c.name), rubricV: RUBRIC.version, lastAt: Number(lastAt) || 0, source: 'judge' };
}
/** A LABELED EXAMPLE {key, lastAt, snippet, verdict, clauses, at}: the record's digest (title — the newest line,
 *  ≤ 200 characters, cleaned like every part on its way out), the person's verdict, the clauses the judge had named. */
function exampleOf(rec, verdict, clauses = [], at = 0) {
  if (!VERDICTS.includes(verdict)) throw new Error('a label is needs or not');
  const r = rec || {};
  const snippet = cleanPart([str(r.title), str(r.body).split('\n')[0]].filter(Boolean).join(' — '), EXAMPLE_DIGEST_MAX, 'line');
  const names = new Set(RUBRIC.clauses.map((c) => c.name));
  return { key: str(r.key).slice(0, 300), lastAt: Number(r.lastAt) || 0, snippet, verdict, clauses: (Array.isArray(clauses) ? clauses : []).filter((c) => names.has(c)), at: Number(at) || 0 };
}
/** The store after a label: NEWEST FIRST, one example per record (a new label replaces its older one), ≤ max. */
const addExample = (list, ex, max = EXAMPLES_KEPT) => [ex, ...(Array.isArray(list) ? list : []).filter((x) => x && x.key !== ex.key)].slice(0, max);
/** What an input carries: the newest ≤ n, oldest first (the plan keeps the LAST of the list it is handed). */
const examplesForInput = (list, n = EXAMPLES_SENT) => (Array.isArray(list) ? list : []).slice(0, n).reverse().map((x) => ({ snippet: x.snippet, verdict: x.verdict }));
/** The catalogue as questions (the "draft from my decisions" button asks them of each example). */
const criteriaQuestions = () => CRITERIA_CATALOGUE.map((c) => ({ type: 'predicate', name: c.name, instructions: c.instructions }));

module.exports = {
  ATTENTION_THRESHOLD_RANGE, USER_BLOCK_MAX, EXAMPLES_KEPT, EXAMPLES_SENT, EXAMPLE_DIGEST_MAX, VERDICTS,   // lane decision-attention
  attentionThreshold, userBlockOf, attentionRecord, judgedOf, exampleOf, addExample, examplesForInput, criteriaQuestions,
  QUESTION_TYPES, PROVIDERS, PROVIDER_LABEL, DEFAULT_MODEL, PRICE_PER_MTOK_USD, DAILY_BUDGET_CENTS_DEFAULT, THRESHOLD_DEFAULT, THRESHOLD_RANGE,
  BACKOFF_MS, RETRY_AFTER_MAX_MS, RATE_MIN_CALLS, MEMO_MAX, FEATURES, WHY, DIALECTS, USES, PLANS, NEVER, JOURNAL_FIELDS, RUBRIC, GOLDEN, CRITERIA_CATALOGUE,
  dialectOf, urlOf, questionError, buildRequest, normalizeAnswers, usageOf, estimateUsd, usdOf, estTokens, questionTokens,
  cutHeadTail, fitTokens, maskAddresses, eraseSecrets, scrub, cleanPart, inputPlan, buildInput, memoMaterial, memoKey, batchQuestions, unbatchAnswers,
  dayOf, rateOf, budgetVerdict, settleUsd, retryAfterMs, nextBackoff, isWall, isKeyRefused, journalRow, rubricQuestions, rubricText, attentionVerdict, criteriaProposal,
};
