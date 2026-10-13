'use strict';
/**
 * THE DECISION ENGINE (lane decision-core, D1 of docs/design-decision-api.zh.md) — ORCH, and the ONLY caller of
 * a decisions API in the tree (scripts/test-vendor-whitelist.mjs allowlists this file alone, by its gates).
 *
 * `judge(use, parts, {questions, memo, accountNever, perHour})`:
 *   1. the MEMO (data/decision-memo.json, LRU 5 000, + memory) — a hit makes NO call;
 *   2. the key from the registry row (`resolveIntegration('decision-api')`: the user's own > the cluster preset >
 *      none) and the plugin's switches + budget (src/plugins/decision-api.js attaches its record here);
 *   3. RESERVE (lane decision-verify-fixes, F1–F5): `budgetVerdict` (PURE) — no key, a switch off, a key the
 *      provider refused, a backoff, the day's budget spent (SETTLED + the open RESERVATIONS + this estimate, in USD),
 *      the hour: a QUIET named refusal (journalled once per reason per 5 min; the day's budget stop says ONE server
 *      notice) — and on a pass the estimate is reserved IN THE SAME synchronous step (`reserve`), so N judgments in
 *      flight with room for one make exactly one call;
 *   4. ONE fetch to the dialect's URL — 429 ⇒ its Retry-After (else the ladder), 5xx / a network failure ⇒ backoff
 *      1 → 5 → 15 min, 401 / 403 ⇒ the row needs a new key (`reconnect`: no call until the key changes), NEVER a retry;
 *   5. SETTLE: the reservation is replaced by `settleUsd` (the vendor's recorded usage.cost, else the reservation —
 *      never 0 for a 200; an answered 4xx / 5xx costs 0) in the counter per day per use (data/decision-usage.json,
 *      tmp + rename; it also keeps the row's recorded cost per token, which prices the next estimates), and a journal
 *      line per call (data/decision-journal.jsonl, bounded 5 000 lines / 30 days: use, memo key, tokens, reserved →
 *      USD, dialect, model, outcome — no key, no text).
 * The input is bounded by the use's plan and asserted again here. A judgment opens no turn: no SPEND_REASONS
 * (design §2.11); a wake caused by a hit rides the turn ceiling where D3 wakes it.
 *
 * USE ④ — THE FOR-YOU PASS (lane inbox-decision-group): `attachInbox(store)` (the user-todos manager) arms a 60 s
 * tick, never a wake path: a moved switch redraws the tray (the store's own broadcast), and every 5 minutes ≤ 10
 * eligible items (PURE `inboxEligible`: open, normal urgency, no options / buttons, no reply, ≥ 1 min old, not scored
 * under this level table) are scored ONE item a call through `judge('inbox', …)` — the same memo, reserve / settle and
 * journal as every use. The verdict lands beside the item (`store.setJudged`: `judged {group, p, at, v}`); the item's
 * urgency is never written.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../decision-model.js');

const ROW_ID = 'decision-api';
const FEATURE_OF = Object.freeze({ attention: 'attention', rule: 'rules', routing: 'routing', inbox: 'inbox', webhook: 'rules', test: null });
const JOURNAL_MAX = 5000;
const JOURNAL_DAYS = 30;
const QUIET_MS = 5 * 60 * 1000;
const TEST_SENTENCE = 'The invoice for the March order is due tomorrow — please confirm you will pay it.';
const TEST_QUESTION = Object.freeze({ type: 'predicate', name: 'deadline_or_money', instructions: 'Does the text mention a deadline or money the reader owes?' });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function create({ dataDir, integrations = null, fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now(),
  tzOffset = (ms) => new Date(ms).getTimezoneOffset(), serverNotice = null, log = console, baseUrlFor = null, timeoutMs = 15000 } = {}) {
  const file = (n) => path.join(dataDir, n);
  const fetch = fetchImpl;                             // the request primitive by its census name (tests hand in a fake)
  const F = { memo: file('decision-memo.json'), usage: file('decision-usage.json'), journal: file('decision-journal.jsonl') };
  let plugin = null;                                   // {peek} — the plugin row's own record (enabled + config)
  const memo = new Map((readJson(F.memo, {}).entries || []).filter((e) => Array.isArray(e) && e.length === 2).slice(-M.MEMO_MAX));
  let usage = readJson(F.usage, null) || { day: null, byUse: {} };
  let backoff = { step: 0, until: 0 };
  const open = new Map();                              // reservation id → {use, usd}: estimates of the calls in flight
  let openSeq = 0;
  let refused = null;                                  // {keySha, status, at}: the provider refused THIS key (401 / 403)
  let state = 'ok';                                    // ok | backoff | reconnect — logged once per change
  let lastOutcome = null;
  const quietAt = new Map();                           // why → last journalled at
  let noticedDay = null;
  const hourCalls = [];                                // call times, the per-hour window
  let journalLines = null;

  const attachPlugin = (h) => { plugin = h && typeof h.peek === 'function' ? h : null; };
  function settings() {
    const rec = plugin ? plugin.peek() || {} : {};
    // lane plugin-settings-p0: the values are the plugin's settings rows (h.settings via the plugin), never rec.config
    const c = plugin && typeof plugin.settings === 'function' ? plugin.settings() || {} : {};
    return {
      pluginOn: !!rec.enabled,
      features: Object.fromEntries(M.FEATURES.map((f) => [f, c[f] === true])),
      dailyBudgetCents: Number.isFinite(Number(c.dailyBudgetCents)) && Number(c.dailyBudgetCents) >= 0 ? Number(c.dailyBudgetCents) : M.DAILY_BUDGET_CENTS_DEFAULT,
      threshold: Number.isFinite(Number(c.threshold)) ? Number(c.threshold) : M.THRESHOLD_DEFAULT,
    };
  }
  /** The row's answer, as the engine needs it — never logged, never returned. */
  function credential(resolved = null) {
    let r = resolved;
    if (!r) { if (!integrations || typeof integrations.resolveIntegration !== 'function') return null; try { r = integrations.resolveIntegration(ROW_ID); } catch { return null; } }
    const v = (r && r.values) || {};
    const provider = M.dialectOf(String(v.provider || '').trim().toLowerCase());
    if (!provider || !v.apiKey) return null;
    return { provider, model: String(v.model || '').trim() || M.DEFAULT_MODEL[provider], key: String(v.apiKey), source: r.source || null };
  }
  function today() {
    const day = M.dayOf(now(), tzOffset(now()));
    if (usage.day !== day) usage = { day, byUse: {}, rate: usage.rate || {} };   // the recorded cost per token outlives the day
    return usage;
  }
  const totalOf = (u) => Object.values(u.byUse).reduce((s, x) => ({ calls: s.calls + x.calls, inputTokens: s.inputTokens + x.inputTokens, outputTokens: s.outputTokens + x.outputTokens, usd: s.usd + x.usd }), { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  const reservedUsd = () => [...open.values()].reduce((a, r) => a + r.usd, 0);
  const rateKey = (cred) => `${cred.provider} ${cred.model}`;
  function say(next, line) { if (next !== state) { state = next; log.warn?.(`[decision] ${line}`); } }
  /** RESERVE — the verdict and the write in ONE synchronous step (no await between them): the ceiling sees every
   *  call in flight. → {v, id?}. */
  function reserve(use, { s, cred, accountNever, est, perHour, t }) {
    const feature = FEATURE_OF[use];
    const rate = cred ? M.rateOf((usage.rate || {})[rateKey(cred)], M.PRICE_PER_MTOK_USD[cred.provider]) : 0;
    const estUsd = est * rate;
    while (hourCalls.length && hourCalls[0] <= t - 3600e3) hourCalls.shift();
    const v = M.budgetVerdict({
      pluginOn: use === 'test' || s.pluginOn, featureOn: feature === null || s.features[feature] === true, keyPresent: !!cred, accountNever,
      reconnect: use !== 'test' && !!(refused && cred && refused.keySha === sha(cred.key)), backoffUntil: backoff.until, now: t,
      spentUsd: totalOf(today()).usd + reservedUsd(), estUsd, ceilingCents: s.dailyBudgetCents, hourCount: hourCalls.length, perHour,
    });
    if (!v.ok) return { v };
    const id = ++openSeq;
    open.set(id, { use, usd: estUsd });
    hourCalls.push(t);
    return { v, id, estUsd };
  }
  /** SETTLE — the reservation leaves; what the call cost lands in the day's counter (a 0-cost error counts nothing). */
  function settle(id, use, u, usd, est) {
    open.delete(id);
    if (!(usd > 0) && !u.inputTokens) return;
    const d = today();
    const x = d.byUse[use] || (d.byUse[use] = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
    x.calls += 1; x.inputTokens += u.inputTokens || est; x.outputTokens += u.outputTokens; x.usd = Math.round((x.usd + usd) * 1e8) / 1e8;
    try { writeJsonAtomic(F.usage, d); } catch (e) { log.warn?.(`[decision] usage not saved: ${e.message}`); }
  }
  function journal(o) {
    const row = M.journalRow({ at: now(), rubric: M.RUBRIC.version, ...o });
    try {
      fs.appendFileSync(F.journal, JSON.stringify(row) + '\n', { mode: 0o600 });
      journalLines = journalLines === null ? countLines() : journalLines + 1;
      if (journalLines > JOURNAL_MAX * 1.2) trimJournal();
    } catch (e) { log.warn?.(`[decision] journal: ${e.message}`); }
  }
  function countLines() { try { return fs.readFileSync(F.journal, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } }
  function trimJournal() {
    const cut = now() - JOURNAL_DAYS * 86400e3;
    const keep = fs.readFileSync(F.journal, 'utf8').split('\n').filter(Boolean).filter((l) => { try { return JSON.parse(l).at >= cut; } catch { return false; } }).slice(-JOURNAL_MAX);
    const tmp = `${F.journal}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, keep.join('\n') + (keep.length ? '\n' : ''), { mode: 0o600 });
    fs.renameSync(tmp, F.journal);
    journalLines = keep.length;
  }
  function memoPut(key, answers) {
    memo.delete(key); memo.set(key, answers);
    while (memo.size > M.MEMO_MAX) memo.delete(memo.keys().next().value);
    try { writeJsonAtomic(F.memo, { entries: [...memo.entries()] }); } catch (e) { log.warn?.(`[decision] memo not saved: ${e.message}`); }
  }
  function quiet(use, why, extra = {}) {
    lastOutcome = { at: now(), use, outcome: 'refused', why };
    const k = `${use}:${why}`;
    if (!(now() - (quietAt.get(k) || 0) < QUIET_MS)) { quietAt.set(k, now()); journal({ use, outcome: 'refused', why, ...extra }); }
    if (why === 'daily-budget' && noticedDay !== usage.day) {
      noticedDay = usage.day;
      try { serverNotice?.('decision-budget', 'The Decision API stopped for today: its daily budget is spent. It resumes tomorrow (⚙ → Plugins → Decision API).', { level: 'warn' }); } catch { }
    }
    return { ok: false, why, ...extra };
  }

  /** ONE judgment. → {ok:true, answers, memo:bool, usage?, usd?} | {ok:false, why, status?, retryAt?}. */
  async function judge(use, parts, { questions, memo: memoParts = null, accountNever = false, perHour = Infinity, resolved = null } = {}) {
    const n = Array.isArray(parts && parts.records) ? parts.records.length : 1;
    if (n > M.inputPlan(use).batch) throw new Error(`a ${use} judgment takes at most ${M.inputPlan(use).batch} record(s)`);
    const qs = n > 1 ? M.batchQuestions(questions, n) : questions;
    const key = memoParts ? M.memoKey(use, memoParts, sha) : null;
    if (key && memo.has(key)) { const a = memo.get(key); memo.delete(key); memo.set(key, a); return { ok: true, memo: true, answers: n > 1 ? M.unbatchAnswers(a, n) : a }; }
    const s = settings();
    const cred = credential(resolved);
    if (refused && cred && refused.keySha !== sha(cred.key)) { refused = null; say('ok', 'a new key is saved: calls resume'); }
    const input = M.buildInput(use, parts);
    if (input.est > input.ceiling) return quiet(use, 'over-ceiling');            // the plan and the builder disagree — never sent
    const est = input.est + M.questionTokens(qs);
    const t = now();
    const { v, id, estUsd } = reserve(use, { s, cred, accountNever, est, perHour, t });   // budgetVerdict + the reservation, one step
    if (!v.ok) return quiet(use, v.why, v.retryAt ? { retryAt: v.retryAt } : {});
    const body = M.buildRequest(cred.provider, { model: cred.model, input: input.text, questions: qs });
    const url = M.urlOf(cred.provider, baseUrlFor && baseUrlFor[cred.provider]);
    const reserved = Math.round(estUsd * 1e8) / 1e8;
    const base = { use, memo: key, dialect: cred.provider, model: cred.model, est, reserved, truncated: input.truncated, n, keyFp: sha(cred.key).slice(0, 6) };
    let status = 0, json = null, retryAfter = null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      // DECISION_ENDPOINT — the ONE vendor call (gates above: budgetVerdict, pluginOn, resolveIntegration(ROW_ID))
      const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${cred.key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
      status = res.status;
      if (status === 429 && res.headers && typeof res.headers.get === 'function') retryAfter = M.retryAfterMs(res.headers.get('retry-after'), now());
      if (res.ok) json = await res.json();
    } catch { } finally { clearTimeout(timer); }   // a body that never parsed keeps its 2xx status (and its reservation)
    const u = json ? M.usageOf(cred.provider, json) : { inputTokens: 0, outputTokens: 0, costUsd: null };
    const usd = M.settleUsd({ status, usage: json ? u : null, reservedUsd: estUsd, pricePerMtok: M.PRICE_PER_MTOK_USD[cred.provider] });
    settle(id, use, u, usd, est);
    const spent = { inputTokens: u.inputTokens || undefined, usd };
    if (M.isKeyRefused(status)) {
      refused = { keySha: sha(cred.key), status, at: now() };
      say('reconnect', `the provider refused the key (HTTP ${status}): no call until a new key is saved`);
      lastOutcome = { at: now(), use, outcome: 'reconnect', status };
      journal({ ...base, ...spent, outcome: 'reconnect', status });
      return { ok: false, why: 'reconnect', status };
    }
    if (M.isWall(status)) {
      backoff = M.nextBackoff(backoff, now(), 'wall', { retryAfter });
      say('backoff', `the provider answered ${status ? `HTTP ${status}` : 'nothing'}: paused until ${new Date(backoff.until).toISOString()}`);
      lastOutcome = { at: now(), use, outcome: 'wall', status, retryAt: backoff.until };
      journal({ ...base, ...spent, outcome: 'wall', status });
      return { ok: false, why: 'backoff', status, retryAt: backoff.until };
    }
    if (!json) { lastOutcome = { at: now(), use, outcome: 'error', status }; journal({ ...base, ...spent, outcome: 'error', status }); return { ok: false, why: 'vendor-error', status }; }
    backoff = M.nextBackoff(backoff, now(), 'ok');
    if (refused) refused = null;
    say('ok', 'the provider answers again');
    if (u.costUsd !== null && u.inputTokens > 0) {   // the row's recorded cost per token (prices the next estimates)
      const d = today(); const rk = rateKey(cred);
      const r = (d.rate || (d.rate = {}))[rk] || (d.rate[rk] = { calls: 0, inputTokens: 0, usd: 0 });
      r.calls += 1; r.inputTokens += u.inputTokens; r.usd = Math.round((r.usd + u.costUsd) * 1e8) / 1e8;
      try { writeJsonAtomic(F.usage, d); } catch (e) { log.warn?.(`[decision] usage not saved: ${e.message}`); }
    }
    const answers = M.normalizeAnswers(cred.provider, json, qs);
    if (key) memoPut(key, answers);
    const hits = use === 'attention' ? M.attentionHits(n > 1 ? M.unbatchAnswers(answers, n) : [answers], s.threshold) : undefined;
    if (hits) {   // the card's 「命中 m 条」: verdicts at or above the threshold today (a memo answer is not a new judgment)
      const d = today(); const x = d.byUse[use] || (d.byUse[use] = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
      x.hits = (x.hits || 0) + hits;
      try { writeJsonAtomic(F.usage, d); } catch (e) { log.warn?.(`[decision] usage not saved: ${e.message}`); }
    }
    lastOutcome = { at: now(), use, outcome: 'ok' };
    journal({ ...base, outcome: 'ok', status, inputTokens: u.inputTokens, outputTokens: u.outputTokens, usd, hits });
    return { ok: true, memo: false, answers: n > 1 ? M.unbatchAnswers(answers, n) : answers, usage: u, usd };
  }

  /** The registry row's Test (human-triggered, one fixed sentence, one predicate) — it counts like any call. */
  async function testRunner({ resolved } = {}) {
    const r = await judge('test', { body: TEST_SENTENCE }, { questions: [TEST_QUESTION], resolved });
    if (!r.ok) return { ok: false, error: r.why === 'no-key' ? 'no provider + key saved (or the provider is not openai / openrouter)' : r.status ? `the provider answered HTTP ${r.status}` : r.why };
    const [first] = r.answers;
    const refused = !!first.refused;
    return { ok: !refused, error: refused ? 'the judge refused the question' : null, detail: { p: refused ? null : first.probability, inputTokens: r.usage.inputTokens, usd: r.usd } };
  }

  function status() {
    const s = settings();
    const cred = credential();
    const d = today();
    return {
      configured: !!cred, provider: cred ? cred.provider : null, providerLabel: cred ? M.PROVIDER_LABEL[cred.provider] : null, model: cred ? cred.model : null, keySource: cred ? cred.source : null,
      features: s.features, dailyBudgetCents: s.dailyBudgetCents, threshold: s.threshold,
      today: { day: d.day, byUse: d.byUse, total: totalOf(d), reserved: Math.round(reservedUsd() * 1e8) / 1e8, inFlight: open.size },
      backoffUntil: backoff.until > now() ? backoff.until : 0, reconnect: refused && cred && refused.keySha === sha(cred.key) ? { status: refused.status, at: refused.at } : null, last: lastOutcome,
    };
  }

  // ── use ④: the For-you pass (lane inbox-decision-group) ───────────────────
  let inbox = null, inboxTimer = null, inboxBusy = false, inboxOnWas = null, inboxLastPass = 0;
  const inboxOn = () => { const s = settings(); return !!(s.pluginOn && s.features.inbox); };
  /** What the tray draws its section head from (the store puts it in its snapshot): null = the switch is off ⇒
   *  today's layout, byte for byte. `today` = the inbox use's paid calls of the instance's day. */
  function grouping() {
    if (!inboxOn()) return null;
    const x = today().byUse.inbox;
    return { on: true, today: x ? x.calls : 0, v: M.INBOX.version };
  }
  /** The switch moved ⇒ ONE broadcast of the store (the tray redraws with or without its sections). */
  function inboxSwitched() {
    const on = inboxOn();
    if (on === inboxOnWas) return;
    inboxOnWas = on;
    try { if (inbox && typeof inbox.notify === 'function') inbox.notify(); } catch { }
  }
  /** ONE pass: ≤ `max` eligible items, one call each (refused ⇒ the pass stops; the next one retries). */
  async function inboxPass({ max = M.inputPlan('inbox').perPass } = {}) {
    if (!inbox || inboxBusy || !inboxOn()) return { ran: false, judged: 0 };
    inboxBusy = true; inboxLastPass = now();
    let judged = 0;
    try {
      const t = now();
      const items = inbox.openItems().filter((i) => M.inboxEligible(i, t) === true).slice(0, max);
      for (const it of items) {
        const r = await judge('inbox', M.inboxScoreInput(it), { questions: [M.INBOX_QUESTION], memo: M.inboxMemoOf(it, sha) });
        if (!r.ok) break;
        const v = M.inboxVerdict(r.answers[0]);
        if (inbox.setJudged(it.id, { group: v ? v.group : null, p: v ? v.p : null, at: now(), v: M.INBOX.version })) judged++;
      }
    } finally { inboxBusy = false; }
    return { ran: true, judged };
  }
  function attachInbox(store, { tickMs = 60 * 1000 } = {}) {
    inbox = store && typeof store.setJudged === 'function' && typeof store.openItems === 'function' ? store : null;
    if (!inbox) return;
    if (typeof inbox.setGrouping === 'function') inbox.setGrouping(grouping);
    inboxOnWas = inboxOn();
    if (tickMs > 0 && !inboxTimer) {
      inboxTimer = setInterval(() => { inboxSwitched(); if (now() - inboxLastPass >= M.INBOX.passMs) inboxPass().catch(() => { }); }, tickMs);
      if (inboxTimer.unref) inboxTimer.unref();
    }
  }

  return { judge, testRunner, status, attachPlugin, settings, memoSize: () => memo.size, files: F, ROW_ID, attachInbox, inboxPass, inboxSwitched, grouping };
}

module.exports = { create, ROW_ID, FEATURE_OF, TEST_SENTENCE };
