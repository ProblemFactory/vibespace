'use strict';
/**
 * THE TEXT MODEL CLIENT (lane rule-learning — design q-037 P0, owner 2026-10-14) — ORCH, and the ONLY file in the tree
 * that builds a chat-completions request (scripts/test-vendor-whitelist.mjs allowlists this file alone, by its gates —
 * a copy anywhere else is RED). A NEW VENDOR SURFACE, gated like the judge:
 *  1. THE KEY: the LLM plugin's registry row (`resolveIntegration('llm')` — the user's own > the cluster preset); the
 *     feature EXISTS only on an OpenRouter row with a key while the plugin AND its drafter switch (`learn`, lane
 *     llm-plugin-rename) are on (PURE `RL.availability`);
 *  2. RESERVE: `budgetVerdict` (PURE — the judge's own verdict) against the plugin's DAILY budget, counting what EVERY
 *     use settled + reserved today (the decision engine's ledger: one counter, one journal), AND the use's own cap
 *     (`learn`: 10 ¢ a day, inside the daily budget); the reservation is held in the SAME synchronous step, so a
 *     judgment in flight sees it and two presses can never both pass one cap;
 *  3. ONE request: OpenRouter's chat completions with the provider routing `{zdr: true, data_collection: 'deny'}` as
 *     LITERALS (the whitelist names both as gates) — only zero-data-retention endpoints, never a provider that keeps
 *     the data; the body and its routing are FROZEN where they are built (a strict module: a later write throws, it
 *     never reaches the wire) and serialized ONCE into bytes, sent as a ONE-SHOT stream with its length (`M.oneShotBody`
 *     — the ONE implementation, the judge's too: lane judge-one-shot-body) — a body with no source is never re-sent by
 *     the platform (Node's fetch re-sends a string body on a 421 over a new connection, empty but with the key: a second
 *     request — found by the status sweep, lane rule-learning-fix-r2 F1); `response_format` = the strict JSON schema; temperature 0; never an Anthropic endpoint (the Sonnet tier
 *     goes through OpenRouter, billed per token). The answers: 404 (no endpoint satisfies the routing) or a 400 that
 *     names the routing ⇒ the NAMED refusal `no-zdr` — NEVER a second request without zdr; 401 / 403 ⇒ `reconnect`;
 *     402 ⇒ `plan`; any other 4xx ⇒ `shape`; 429 / 5xx / no answer ⇒ `vendor-busy` (no retry: the owner presses again);
 *     a 3xx is NEVER followed (`redirect: 'error'` ⇒ the named refusal `redirect` — the digests go to OpenRouter or
 *     nowhere; lane rule-learning-fix L2);
 *  4. SETTLE: the reservation is replaced by the vendor's `usage.cost` (else the reservation) in the day's counter
 *     (use `learn`), and ONE journal line (use, model, tokens, reserved → usd, zdr: true, outcome — no key, no text);
 *     a request that never left the box (or a refused redirect) RELEASES its reservation (M.fetchFailOf — L3).
 * No timer: every call is a button the owner pressed (P1's weekly digest is OFF and not wired).
 */
const crypto = require('crypto');
const M = require('../decision-model.js');
const RL = require('../rule-learning.js');

const ROW_ID = 'llm';                     // ONE key box for the judge and the drafter (the Language model card)
const HOST = 'https://openrouter.ai';
const PATH = '/api/v1/chat/completions';
// a 400 that names the routing ⇒ no ZDR endpoint for this model (a 404 always is: nothing satisfies the routing)
const NO_ZDR_RE = /zero[- ]data[- ]retention|\bzdr\b|data[ _-]collection|data polic|no endpoints/i;

const sha6 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 6);
/** OpenRouter's usage block → {inputTokens, outputTokens, costUsd | null}. */
function usageOf(j) {
  const u = (j && j.usage) || {};
  const cost = u.cost === null || u.cost === undefined ? NaN : Number(u.cost);
  return { inputTokens: Number(u.prompt_tokens) || 0, outputTokens: Number(u.completion_tokens) || 0, costUsd: Number.isFinite(cost) && cost >= 0 ? cost : null };
}
/** The answer's JSON text (the first choice's message) — null when there is none. */
function answerOf(j) {
  const m = j && Array.isArray(j.choices) && j.choices[0] && j.choices[0].message;
  const c = m ? m.content : null;
  return typeof c === 'string' && c.trim() ? c : c && typeof c === 'object' ? c : null;
}
/** A refused / failed answer, by name (the card words each one). */
function refusalOf(status, message = '') {
  if (status === 404 || (status === 400 && NO_ZDR_RE.test(String(message || '')))) return 'no-zdr';
  if (status === 401 || status === 403) return 'reconnect';
  if (status === 402) return 'plan';
  if (status >= 400 && status < 500 && status !== 429) return 'shape';
  return 'vendor-busy';
}

function create({ integrations = null, ledger = null, fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now(), log = console, baseUrl = null, timeoutMs = RL.LEARN.timeoutMs } = {}) {
  const fetch = fetchImpl;                             // the request primitive by its census name (tests hand in a fake)
  const url = `${String(baseUrl || HOST).replace(/\/+$/, '')}${PATH}`;
  let said = null;
  const say = (why, line) => { if (why !== said) { said = why; if (why) log.warn?.(`[learn] ${line}`); } };
  /** The row's answer — never logged, never returned. */
  function credential() {
    if (!integrations || typeof integrations.resolveIntegration !== 'function') return null;
    try { return integrations.resolveIntegration(ROW_ID); } catch { return null; }
  }
  const settings = () => { try { return (ledger && ledger.settings()) || { pluginOn: false }; } catch { return { pluginOn: false }; } };
  /** Is the drafter there? → {exists, why, tier, model, label, estUsd} (estUsd = a full-size call). */
  function available() {
    const s = settings();
    const a = RL.availability({ integrationRow: credential(), pluginOn: s.pluginOn, learnOn: s.learnOn !== false });
    const tier = RL.modelOf(s.learnModel);
    return { exists: a.exists, why: a.why, tier: tier.key, model: tier.id, label: tier.label, estUsd: RL.learnCost(tier.key, RL.LEARN.inputMax, 1000) };
  }

  /** ONE completion. → {ok: true, answer, usage, usd, model, label} | {ok: false, why, status?}. */
  async function complete({ use = 'learn', messages = [], schema = null, est = 0, outMax = RL.LEARN.outputMax, name = 'proposal' } = {}) {
    if (!ledger) return { ok: false, why: 'plugin-off' };
    const s = settings();
    const row = credential();
    const a = RL.availability({ integrationRow: row, pluginOn: s.pluginOn, learnOn: s.learnOn !== false });   // pluginOn + the drafter's switch + the row's provider + key
    if (!a.exists) return { ok: false, why: a.why };
    const tier = RL.modelOf(s.learnModel);
    const key = String(row.values.apiKey).trim();
    const estUsd = RL.learnCost(tier.key, est, outMax);
    // RESERVE — the verdict and the hold in ONE synchronous step (no await between them)
    const v = M.budgetVerdict({ pluginOn: s.pluginOn, featureOn: true, keyPresent: !!key, now: now(), spentUsd: ledger.spentUsd(), estUsd, ceilingCents: s.dailyBudgetCents, useSpentUsd: ledger.useUsd(use), useCeilingCents: RL.USE_CAP_CENTS[use] });
    if (!v.ok) { ledger.journal({ use, model: tier.id, outcome: 'refused', why: v.why, zdr: true }); return { ok: false, why: v.why }; }
    const hold = ledger.hold(use, estUsd);
    const body = Object.freeze({
      model: tier.id, messages, temperature: 0, max_tokens: outMax,
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
      provider: Object.freeze({ zdr: true, data_collection: 'deny' }),   // THE GATES: zero-data-retention endpoints only, no provider that keeps data — never a request without them
      usage: { include: true },
    });
    const bytes = new TextEncoder().encode(JSON.stringify(body));   // serialized ONCE
    let status = 0, json = null, message = '', failed = null, sending = null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      // TEXT_ENDPOINT — the ONE chat completions call (gates above: budgetVerdict, pluginOn, resolveIntegration(ROW_ID), zdr: true)
      sending = fetch(url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'content-length': String(bytes.length) }, body: M.oneShotBody(bytes), duplex: 'half', signal: ac.signal, redirect: 'error' });
      const res = await sending;
      status = res.status;
      const j = await res.json().catch(() => null);
      if (res.ok) json = j;
      else message = String((j && j.error && (typeof j.error === 'string' ? j.error : j.error.message)) || '').slice(0, 300);   // read for its name only: never logged, never returned
    } catch (e) { failed = sending ? M.fetchFailOf(e) : 'unsent'; } finally { clearTimeout(timer); }   // a refused redirect / nothing sent (the primitive threw before it returned) ⇒ released
    const u = json ? usageOf(json) : { inputTokens: 0, outputTokens: 0, costUsd: null };
    const usd = M.settleUsd({ status, usage: json ? u : null, reservedUsd: estUsd, pricePerMtok: tier.inPerMtok, failed });
    ledger.settle(hold, use, u, usd, est);
    const base = { use, model: tier.id, est, reserved: Math.round(estUsd * 1e8) / 1e8, status, zdr: true, keyFp: sha6(key) };
    const answer = json ? answerOf(json) : null;
    if (answer === null) {
      const why = failed === 'redirect' ? 'redirect' : status >= 200 && status < 300 ? 'bad-answer' : refusalOf(status, message);
      say(why, why === 'no-zdr' ? `${tier.id} has no zero-data-retention endpoint (HTTP ${status}) — refused, never sent without it`
        : why === 'redirect' ? 'the provider answered a redirect — not followed (never a request to another origin)' : `the provider answered ${status ? `HTTP ${status}` : 'nothing'} (${why})`);
      ledger.journal({ ...base, usd, outcome: why });
      return { ok: false, why, status };
    }
    say(null, '');
    ledger.journal({ ...base, outcome: 'ok', inputTokens: u.inputTokens, outputTokens: u.outputTokens, usd });
    return { ok: true, answer, usage: u, usd, model: tier.id, label: tier.label, status };
  }

  return { complete, available, url };
}

module.exports = { create, ROW_ID, refusalOf, usageOf };
