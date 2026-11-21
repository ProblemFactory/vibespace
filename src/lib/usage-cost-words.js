// THE UNKNOWN PART OF A COST, IN WORDS (lane lg-providers, B-d578 P1-b — the law agreed 2026-11-21): a third-party
// provider's model that no price row matches has NO price. Its tokens are shown; its cost never reads «$0.00» and is
// never priced at another model's rates; and every figure that ADDS costs (a day's, a conversation's, an account's, the
// window's total) says it leaves that part out — an unknown price never reads as a smaller bill. A row of the hub's
// usage answer carries `unpricedRequests` / `unpricedTokens` beside `cost` (the priced part only; src/usage-history.js
// priceUnknown). A row the person adds in «Pricing…» makes it a cost.
// PURE — imports nothing, touches no DOM (node-imported by scripts/test-pricing-tiers.mjs §6); the caller hands in t and
// its own number formatters.

/** The unknown part of a row: {requests, tokens}, or null when every request of it is priced. */
export function unpricedOf(r) {
  const requests = Number(r && r.unpricedRequests) || 0;
  return requests > 0 ? { requests, tokens: Number(r.unpricedTokens) || 0 } : null;
}

/** A row's cost in words. `text` = the figure where a figure stands («$12.30», «$12.30 + unknown», «price unknown»);
 *  `short` = a few words for a tile's second line; `note` = the sentence that says what is left out and where a price is
 *  added (null when nothing is left out); `unknown` = whether any part is unknown; `all` = whether every request is. */
export function costWords(r, t, fmtCost, fmtNum) {
  const u = unpricedOf(r);
  const cost = Number(r && r.cost) || 0;
  if (!u) return { text: fmtCost(cost), short: null, note: null, unknown: false, all: false };
  const all = u.requests >= (Number(r && r.requests) || 0);
  const tokens = fmtNum(u.tokens);
  return {
    text: all ? t('price unknown') : t('{usd} + unknown', { usd: fmtCost(cost) }),
    short: t('leaves out {tokens} tokens of unknown price', { tokens }),
    note: all
      ? t('Price unknown: {tokens} tokens of a provider\'s model that no price row matches — add its price in «Pricing…»', { tokens })
      : t('Leaves out {tokens} tokens whose price is unknown (a provider\'s model that no price row matches) — add its price in «Pricing…»', { tokens }),
    unknown: true, all,
  };
}

/** Several rows' figures added — a slice that folds rows together («Other»): its priced cost and its unknown part. */
export function sumParts(rows) {
  const out = { cost: 0, requests: 0, unpricedRequests: 0, unpricedTokens: 0 };
  for (const r of rows || []) {
    if (!r) continue;
    out.cost += Number(r.cost) || 0; out.requests += Number(r.requests) || 0;
    out.unpricedRequests += Number(r.unpricedRequests) || 0; out.unpricedTokens += Number(r.unpricedTokens) || 0;
  }
  return out;
}

/** A cost-ordered list cut to its first `n`: a row with an unknown part sorts as its priced part (often $0), so it is
 *  KEPT in view past the cut — up to `extra` such rows — never dropped as the smallest bill. A row is a usage row or a
 *  wrapper carrying it as `raw`. */
export function keepUnpriced(rows, n, extra = 5) {
  const all = rows || [];
  const list = all.slice(0, n);
  for (const r of all.slice(n)) {
    if (list.length >= n + extra) break;
    if (unpricedOf(r && r.raw ? r.raw : r)) list.push(r);
  }
  return list;
}

/** The models of an answer whose price is unknown — the «Add a price» rows of the pricing editor: [{model, key, acct, tokens}],
 *  ONE row per (key, provider account) — the row is written as THAT provider account's own (r1131 item 2: the same id on a
 *  first-party sign-in keeps its own price) — never an empty key (it would match every model). Read from the answer's model
 *  rows: a model row's `unpricedBy` names the provider accounts that ran it at an unknown price (`tokens` is the model's
 *  whole unknown part when one account ran it, else null — the answer does not split it). Most tokens first. */
export function unpricedModels(data) {
  const rows = (data && data.groups && data.groups.model) || [];
  const byKey = new Map();
  for (const r of rows) {
    if (!unpricedOf(r) || !r.key || r.key === 'unknown' || !Array.isArray(r.unpricedBy)) continue;
    const key = priceKeyOf(r.key);
    if (!key) continue;
    for (const acct of r.unpricedBy) {
      if (typeof acct !== 'string' || !acct) continue;
      const id = key + '\n' + acct, had = byKey.get(id), tokens = r.unpricedBy.length === 1 ? Number(r.unpricedTokens) || 0 : null;
      if (had) had.tokens = had.tokens == null || tokens == null ? null : had.tokens + tokens;
      else byKey.set(id, { model: String(r.key), key, acct, tokens });
    }
  }
  return [...byKey.values()].sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
}

/** THE RATE CHECK the page asks before Save (courtesy — the route refuses the same, src/catalog-pricing.js rateErrors): a
 *  typed rate is a plain number at or above 0 and under `ceiling` (USD per million tokens). → null (good) | the reason. */
export function rateProblem(text, ceiling = 1000) {
  const s = String(text == null ? '' : text).trim();
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return /^-/.test(s) ? 'negative' : 'not-a-number';
  const v = Number(s);
  if (!Number.isFinite(v)) return 'not-a-number';
  if (v >= ceiling) return 'over-ceiling';
  return null;
}

/** Which OTHER models of the answer a new row under `key` would price too (usage-history _tier: the LONGEST key a
 *  lower-cased model id CONTAINS wins): every model whose id contains `key` and whose own match today is shorter (or
 *  none). `tierKeys` = the table's keys; `typed` = the keys the person is adding beside it (a longer one wins for its
 *  model). → [model ids]. */
export function alsoPrices(key, models, tierKeys, typed = []) {
  if (!key) return [];
  const keys = [...(tierKeys || []).filter((k) => k !== '_default'), ...(typed || []).filter((k) => k && k !== key)];
  const out = [];
  for (const m of models || []) {
    const id = priceKeyOf(m);
    if (!id || id === key || !id.includes(key)) continue;
    const own = keys.filter((k) => id.includes(k)).sort((a, b) => b.length - a.length)[0] || '';
    if (own.length < key.length) out.push(String(m));
  }
  return out;
}

/** The table key a person's price row for `model` is written under: the matcher's own spelling (usage-history _tier
 *  lower-cases the model id and matches a key it CONTAINS), so the row matches this model from the next answer on. */
export function priceKeyOf(model) {
  return String(model || '').trim().toLowerCase().slice(0, 128);
}

