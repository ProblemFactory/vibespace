'use strict';
// WHAT THE BULK RESUME WILL COST — SAID BEFORE THE CLICK LANDS (lane auto-resume-bulk, ADDENDUM 1, the owner 2026-10-23).
// A stopped conversation re-reads its whole context COLD when it is resumed (no prompt-cache hit survives a stop of
// minutes-to-hours), so resuming N of them at once is N cold reads. The confirm dialog of «恢复所有因用量/过载停止的会话»
// and the Settings row's passive line say, in the person's units, BEFORE anything runs:
//   (a) DOLLARS  Σ over the N sessions of (its current context tokens — the usage ledger's last main-thread request for
//                that conversation, never a vendor call) × the model's UNCACHED input price, + a nominal first-output
//                allowance per session (OUTPUT_ALLOWANCE, said under the number). The price ROW is the live table of
//                src/usage-history.js (its own model → row match) — handed in, never a second table.
//   (b) THE 5 h WINDOW per pool member the batch bills (the slot each continue lands on — the engine's fireIdentityFor):
//                the expected share from the member's MEASURED tokens-per-percent in its CURRENT window — Δ% (the usage
//                cache's 5 h utilization, the window starting at 0) ÷ Δtokens (this window's ledger records of that
//                member). THE TOKENS COUNTED are the classes a cold resume spends — cache writes + uncached input.
//                Cache READS are left out on purpose: the 5 h bucket weighs them far below a write (src/usage-anchors.js'
//                own real-data fit: full bucket ≈ $443 of writes vs ≈ $2556 of reads), so counting them would make
//                "1 % ≈ N tokens" several times too large and the batch's share several times too SMALL. Attributing the
//                window's whole Δ% to the counted tokens errs the other way — toward a LARGER share — which is the
//                direction a warning may err in. No basis (a fresh window, < MIN_PCT used, no counted tokens) ⇒ the
//                percent says «无法估算» — never a made-up number; the dollars still show.
//   (c) K        «只恢复前 K 个（按最早停止优先）» — the largest prefix of the batch (earliest stop first) that keeps every
//                member with a basis at or under the soft band (account-pool-auto THRESH.fiveHour.hot: the pool's own
//                "hot" line, as % USED = 100 − hot). A member with no basis constrains nothing it cannot measure — the
//                words say which.
// PURE: imports nothing; the ORCH (src/server/bulk-resume-routes.js) reads the ledger, the caches and the price table.

const OUTPUT_ALLOWANCE = 2000;   // tokens of first output assumed per resumed session (nominal — said under the number)
const MIN_PCT = 1;               // below 1 % used the window's ratio is noise, not a measurement
const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** The member's measured ratio in its current window: tokens (cache writes + uncached input) per 1 % used.
 *  rows = this window's ledger records ALREADY filtered to the member; pctNow = % used now. null = no basis. */
function windowRatio({ rows = [], pctNow = null } = {}) {
  const pct = Number(pctNow);
  if (!Number.isFinite(pct) || pct < MIN_PCT) return null;
  let tokens = 0;
  for (const r of rows || []) if (r) tokens += num(r.cw5) + num(r.cw1) + num(r.i);
  if (!(tokens > 0)) return null;
  return { tokensPerPct: tokens / pct, tokens, pct };
}

/** A conversation's current context size from its newest main-thread ledger request (the status bar's own formula:
 *  input + cache read + cache writes). rows = that conversation's records, any order. null = the ledger has none. */
function contextOf(rows = []) {
  let best = null;
  for (const r of rows || []) {
    if (!r || (r.origin && r.origin !== 'main')) continue;
    if (!best || num(r.ts) > num(best.ts)) best = r;
  }
  if (!best) return null;
  const tokens = num(best.i) + num(best.cr) + num(best.cw5) + num(best.cw1);
  return tokens > 0 ? { tokens, model: best.model || null, ts: num(best.ts) } : null;
}

/** THE ESTIMATE.
 *  items   [{id, name, at (stopped at), model, contextTokens (null = unknown), member: {key, name}}]
 *  priceOf (model, item) => {input, output, cacheWrite5m, label} USD per million — the live price table's row for that item
 *          (its account, its context size), or null
 *  members {[key]: {name, pctNow (0..100 | null), ratio: windowRatio(...) | null}}
 *  softBandPct  the % USED a window must stay at or under for «只恢复前 K 个» */
function estimateBatch({ items = [], priceOf = () => null, members = {}, softBandPct = 90, outputAllowance = OUTPUT_ALLOWANCE } = {}) {
  const list = (Array.isArray(items) ? items : []).filter((x) => x && x.id).slice().sort((a, b) => num(a.at) - num(b.at) || (String(a.id) < String(b.id) ? -1 : 1));
  const perModel = new Map(), perMember = new Map();
  let usd = 0, coldTokens = 0, unknown = 0, unpriced = 0;
  const priced = list.map((it) => {
    let row = null;
    try { row = priceOf(it.model, it) || null; } catch { row = null; }
    const ctx = it.contextTokens === null || it.contextTokens === undefined ? null : Math.max(0, num(it.contextTokens));
    if (ctx === null) unknown++;
    if (!row) unpriced++;
    const tokens = ctx || 0;
    // a cold resume re-reads its context as cache WRITES (the ledger prices them at cacheWrite5m); a row with none (no
    // cache premium on that vendor) is priced at its input rate
    const unit = row ? (num(row.cacheWrite5m) > 0 ? num(row.cacheWrite5m) : num(row.input)) : 0, unitKind = row && num(row.cacheWrite5m) > 0 ? 'cache-write' : 'input';
    const cost = row ? (tokens * unit + outputAllowance * num(row.output)) / 1e6 : 0;
    usd += cost; coldTokens += tokens;
    const mk = row ? (row.label || String(it.model || '?')) : String(it.model || '?');
    const pm = perModel.get(mk) || { model: mk, unitPerM: row ? unit : null, unitKind: row ? unitKind : null, tokens: 0, usd: 0, n: 0 };
    pm.tokens += tokens; pm.usd += cost; pm.n++; perModel.set(mk, pm);
    const key = it.member && it.member.key ? String(it.member.key) : '__unknown__';
    const m = perMember.get(key) || { key, name: (it.member && it.member.name) || (members[key] && members[key].name) || key, n: 0, coldTokens: 0, usd: 0 };
    m.n++; m.coldTokens += tokens; m.usd += cost; perMember.set(key, m);
    return { ...it, key, tokens, cost };
  });
  const memberRows = [...perMember.values()].map((m) => {
    const facts = members[m.key] || {};
    const pctNow = facts.pctNow === null || facts.pctNow === undefined ? null : num(facts.pctNow);
    const ratio = facts.ratio && facts.ratio.tokensPerPct > 0 ? facts.ratio : null;
    const addPct = ratio ? m.coldTokens / ratio.tokensPerPct : null;
    return { ...m, pctNow, basis: ratio ? { tokensPerPct: ratio.tokensPerPct } : null, addPct, afterPct: addPct !== null && pctNow !== null ? pctNow + addPct : null };
  });
  // THE K CUT: earliest stop first, every member with a basis kept at or under the soft band
  const add = new Map(), ratioOf = new Map(memberRows.map((m) => [m.key, m]));
  let k = 0;
  for (const it of priced) {
    const m = ratioOf.get(it.key);
    if (m && m.basis) {
      const next = (add.get(it.key) || 0) + it.tokens / m.basis.tokensPerPct;
      if ((m.pctNow || 0) + next > softBandPct) break;
      add.set(it.key, next);
    }
    k++;
  }
  const measured = memberRows.filter((m) => m.basis);
  return {
    n: priced.length, usd, coldTokens, outputAllowance, unknownContext: unknown, unpriced,
    perModel: [...perModel.values()], perMember: memberRows,
    order: priced.map((p) => p.id), k, softBandPct,
    // the Settings row's one number: the largest member share (several members ⇒ the dialog has one line each)
    topAddPct: measured.length ? Math.max(...measured.map((m) => m.addPct)) : null,
    unconstrained: memberRows.filter((m) => !m.basis).map((m) => m.key),
  };
}

// ── THE WORDS (through the caller's t; zh/ja live in the client dictionaries — test-bulk-resume-cost pins them) ─────
const plain = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const tOf = (tIn) => (typeof tIn === 'function' ? (s, p) => tIn(s, p) : plain);
const money = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
const tok = (x) => (x >= 1e6 ? (x / 1e6).toFixed(2) + ' M' : x >= 1e3 ? Math.round(x / 1e3) + ' k' : String(Math.round(x)));
const pctText = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);

/** {dollars, allowance, members:[{line, basis}], passive, allButton, kButton|null, unknown|null} */
function costWords(est, tIn) {
  const t = tOf(tIn);
  if (!est || !est.n) return null;
  const top = est.perModel.slice().sort((a, b) => b.usd - a.usd)[0];
  // the price table's own fallback row has a NAME in the person's words, never its key
  const modelName = (m) => (m === '_default' ? t('an unknown model (the default price)') : m);
  // ONE model priced ⇒ its price is named; several ⇒ the sum alone (one model's price over a mixed sum would mislead)
  const one = est.perModel.length === 1 && top && top.unitPerM !== null ? top : null;
  const dollars = one
    ? (one.unitKind === 'cache-write'
      ? t('≈ ${usd} at {model} cache-write ${price}/M, {tokens} cold tokens', { usd: money(est.usd), model: modelName(one.model), price: one.unitPerM, tokens: tok(est.coldTokens) })
      : t('≈ ${usd} at {model} input ${price}/M, {tokens} cold tokens', { usd: money(est.usd), model: modelName(one.model), price: one.unitPerM, tokens: tok(est.coldTokens) }))
    : t('≈ ${usd} for {tokens} cold tokens', { usd: money(est.usd), tokens: tok(est.coldTokens) });
  const allowance = t('includes a nominal {n} output tokens per session', { n: est.outputAllowance });
  // the machine's own login has a NAME in the person's words, never its ledger key (`__global__`, `__global_codex__`)
  const who = (m) => (/^__global/.test(String(m.key)) ? t('This machine’s own login') : m.name);
  const members = est.perMember.map((m) => m.basis
    ? {
      line: m.pctNow !== null
        ? t('≈ {add} % of the 5 h window of {member}; it is at {now} % now ⇒ ~{after} % after', { add: pctText(m.addPct), member: who(m), now: pctText(m.pctNow), after: pctText(m.afterPct) })
        : t('≈ {add} % of the 5 h window of {member}', { add: pctText(m.addPct), member: who(m) }),
      basis: t('measured in this window: 1 % ≈ {tokens} tokens', { tokens: tok(m.basis.tokensPerPct) }),
    }
    : { line: t('{member}: cannot estimate — this window has no measured ratio yet', { member: who(m) }), basis: null });
  const passive = est.topAddPct !== null
    ? t('If you resumed them all now: ≈ ${usd} · ≈ {pct} % of the 5 h window', { usd: money(est.usd), pct: pctText(est.topAddPct) })
    : t('If you resumed them all now: ≈ ${usd} · the 5 h share cannot be estimated yet', { usd: money(est.usd) });
  const kButton = est.k > 0 && est.k < est.n ? t('Resume only the first {k} (earliest stopped first)', { k: est.k }) : null;
  const unknown = est.unknownContext ? t('{n} sessions have no known context size — not counted', { n: est.unknownContext }) : null;
  return { dollars, allowance, members, passive, allButton: t('Resume all ({n})', { n: est.n }), kButton, unknown };
}

const WORD_KEYS = Object.freeze([
  '≈ ${usd} at {model} input ${price}/M, {tokens} cold tokens', '≈ ${usd} at {model} cache-write ${price}/M, {tokens} cold tokens', '≈ ${usd} for {tokens} cold tokens',
  'includes a nominal {n} output tokens per session',
  '≈ {add} % of the 5 h window of {member}; it is at {now} % now ⇒ ~{after} % after', '≈ {add} % of the 5 h window of {member}',
  'measured in this window: 1 % ≈ {tokens} tokens', '{member}: cannot estimate — this window has no measured ratio yet',
  'If you resumed them all now: ≈ ${usd} · ≈ {pct} % of the 5 h window', 'If you resumed them all now: ≈ ${usd} · the 5 h share cannot be estimated yet',
  'Resume only the first {k} (earliest stopped first)', '{n} sessions have no known context size — not counted', 'Resume all ({n})',
  'This machine’s own login', 'an unknown model (the default price)',
]);

module.exports = { OUTPUT_ALLOWANCE, MIN_PCT, FIVE_HOUR_MS, WORD_KEYS, windowRatio, contextOf, estimateBatch, costWords };
