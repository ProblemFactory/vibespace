'use strict';
/**
 * THE DECISION ENGINE (lane decision-core, D1 of docs/design-decision-api.zh.md) — ORCH, and the ONLY caller of
 * a decisions API in the tree (scripts/test-vendor-whitelist.mjs allowlists this file alone, by its gates).
 *
 * `judge(use, parts, {questions, memo, accountNever, perHour})`:
 *   1. the MEMO (data/decision-memo.json, LRU 5 000, + memory) — a hit makes NO call;
 *   2. the key from the registry row (`resolveIntegration('llm')`: the user's own > the cluster preset > none) and the
 *      LLM plugin's switches + budget + judging model (src/plugins/llm.js attaches its record here — lane
 *      llm-plugin-rename: the model is the plugin's `judgeModel` row, else the cluster preset's `model` while its key is
 *      in use, else the provider's default);
 *   3. RESERVE (lane decision-verify-fixes, F1–F5): `budgetVerdict` (PURE) — no key, a switch off, a key the
 *      provider refused, a backoff, the day's budget spent (SETTLED + the open RESERVATIONS + this estimate, in USD),
 *      the hour: a QUIET named refusal (journalled once per reason per 5 min; the day's budget stop says ONE server
 *      notice) — and on a pass the estimate is reserved IN THE SAME synchronous step (`reserve`), so N judgments in
 *      flight with room for one make exactly one call;
 *   4. ONE fetch to the dialect's URL (every question's owner-written text through `M.scrubQuestions` first — the ONE
 *      scrub, B-d375); the body FROZEN where it is built, serialized ONCE into bytes and sent as a ONE-SHOT stream with
 *      its length (`M.oneShotBody`, the text client's own — lane judge-one-shot-body: Node's fetch re-sends a string body
 *      on an HTTP 421 over a new connection, empty but with the key — a second request); a 3xx is never followed —
 *      429 ⇒ its Retry-After (else the ladder), 5xx / a network failure ⇒ backoff 1 → 5 → 15 min;
 *      a ROW STOP (`M.rowStopOf`, lane decision-vendor-hygiene): 401 / 403 ⇒ the row needs a new key (`reconnect`),
 *      402 ⇒ the plan does not allow the model (`plan`), 400 ⇒ the model refused the request shape (`shape`) — no
 *      call until the key, the provider or the model changes (the owner's Test still calls; its 200 lifts the stop),
 *      `plan` / `shape` say ONE server notice; NEVER a retry, never one call a record;
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
 * v2 (lane decision-inbox-rank): each pass first reads the BOARD once (`attachInbox(store, {board})` — the wiring's
 * reader of vibespace-status's record + history and the newest vibespace-task progress note of a conversation; never a
 * store of its own) and writes every sortable item's PURE `inboxFacts` (`store.setFacts`, only when they changed — no
 * call); then the items the rules do not place already (a blocked fact, the 48 h decay) are judged with their facts line
 * (`judged {group, why, p, at, v, facts, sig}`). A pass a refusal stopped is SAID: a log line when the reason changes and
 * `status().inbox` {at, judged, placed, stopped} (the plugin's status carries it).
 * lane foryou-folds (design q-044 decision 3): THE JUDGE IS A TIE-BREAKER. The facts half runs on every pass whatever the
 * switch (free — the attention list's bands 2–3 read them: a blocked board, a named date), and the judge scores ONLY the
 * rows src/attention-model.js `tieCandidates` names (band-5 asks that share their minute with another) — every other row
 * is placed by facts, so the For-you judge went from 25–100 calls a day to about none. `status().inbox` adds `untied`
 * (eligible rows the rule left alone).
 *
 * USE reply-infer (lane dm-reply-infers, B-6b4b): the channels engine's pre-pass asks ONE fixed question
 * (`M.REPLY_INFER_QUESTION`) per candidate — a peer's plain message after a send of the principal, in the rule's scope —
 * with the memo = the candidate record + the sent message (judged once, for ever); the Rules switch gates it, the day's
 * budget bounds it like every use, and its journal line carries the score (`p`).
 *
 * THE LEDGER (lane rule-learning, design q-037 P0): the ONE other paid caller on this pool — src/server/text-model-client.js
 * (the chat completions that DRAFT the person's 「我关心什么」 block, use `learn`) — is created HERE (`textModel`) over
 * `ledger`: the plugin's switches + budget, what the day spent (settled + reserved, every use), one use's share, a
 * reservation in the SAME `open` map (`hold`), the settle and the journal — one counter, one journal, one daily budget.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../decision-model.js');
const A = require('../attention-model.js'); // PURE: THE attention list (lane foryou-folds) — the judge scores only a band-5 tie

const ROW_ID = 'llm';   // lane llm-plugin-rename: the Language model row (the key) — its data files keep their decision-* names
const FEATURE_OF = Object.freeze({ attention: 'attention', rule: 'rules', routing: 'routing', inbox: 'inbox', webhook: 'rules', 'reply-infer': 'rules', test: null });   // + reply-infer (lane dm-reply-infers): a reply rule's judgment rides the Rules switch
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
  let stop = null;                                     // {sig, why, status, at}: the provider refused THIS key + model (a row stop)
  let state = 'ok';                                    // ok | backoff | reconnect | plan | shape — logged once per change
  let noticedStop = null;                              // the row stop whose notice reached a client (one per stop)
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
      learnModel: typeof c.learnModel === 'string' ? c.learnModel : null,   // lane rule-learning: the drafter's tier (flash | sonnet)
      learnOn: c.learn !== false,   // lane llm-plugin-rename: the drafter's own switch (the text-model client's availability)
      judgeModel: typeof c.judgeModel === 'string' ? c.judgeModel.trim() : '',   // the plugin's row ('' = the preset's / the provider's)
    };
  }
  /** The row's answer, as the engine needs it — never logged, never returned. */
  function credential(resolved = null) {
    let r = resolved;
    if (!r) { if (!integrations || typeof integrations.resolveIntegration !== 'function') return null; try { r = integrations.resolveIntegration(ROW_ID); } catch { return null; } }
    const v = (r && r.values) || {};
    const provider = M.dialectOf(String(v.provider || '').trim().toLowerCase());
    if (!provider || !v.apiKey) return null;
    // the judging model: the plugin's row > the cluster preset's choice while ITS key is in use (a model named for the
    // cluster's provider never rides the user's own key) > the provider's default
    const preset = r.source === 'cluster' ? String(v.model || '').trim() : '';
    return { provider, model: settings().judgeModel || preset || M.DEFAULT_MODEL[provider], key: String(v.apiKey), source: r.source || null };
  }
  function today() {
    const day = M.dayOf(now(), tzOffset(now()));
    if (usage.day !== day) usage = { day, byUse: {}, rate: usage.rate || {} };   // the recorded cost per token outlives the day
    return usage;
  }
  const totalOf = (u) => Object.values(u.byUse).reduce((s, x) => ({ calls: s.calls + x.calls, inputTokens: s.inputTokens + x.inputTokens, outputTokens: s.outputTokens + x.outputTokens, usd: s.usd + x.usd }), { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  const reservedUsd = () => [...open.values()].reduce((a, r) => a + r.usd, 0);
  const rateKey = (cred) => `${cred.provider} ${cred.model}`;
  /** A row stop holds while the credential is the one refused: the same key, provider and model (a change of any lifts it). */
  const credSig = (cred) => sha(`${cred.provider}\n${cred.model}\n${cred.key}`);
  const stopOf = (cred) => (stop && cred && stop.sig === credSig(cred) ? stop.why : null);
  function say(next, line) { if (next !== state) { state = next; log.warn?.(`[decision] ${line}`); } }
  /** RESERVE — the verdict and the write in ONE synchronous step (no await between them): the ceiling sees every
   *  call in flight. → {v, id?}. */
  function reserve(use, { s, cred, accountNever, est, perHour, t }) {
    const feature = FEATURE_OF[use];
    const rate = cred ? M.rateOf((usage.rate || {})[rateKey(cred)], M.PRICE_PER_MTOK_USD[cred.provider]) : 0;
    const estUsd = est * rate;
    while (hourCalls.length && hourCalls[0] <= t - 3600e3) hourCalls.shift();
    const held = use === 'test' ? null : stopOf(cred);   // the owner's Test always calls: it is how a fixed plan is seen
    const v = M.budgetVerdict({
      pluginOn: use === 'test' || s.pluginOn, featureOn: feature === null || s.features[feature] === true, keyPresent: !!cred, accountNever,
      reconnect: held === 'reconnect', plan: held === 'plan', shape: held === 'shape', backoffUntil: backoff.until, now: t,
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
  // lane decision-vendor-hygiene: a row stop the owner must act on (the plan, the request shape) says ONE server notice — the
  // client words it from the i18n key, `text` stays the English; a notice no client received is said again at the next refusal
  const STOP_NOTICE = Object.freeze({
    plan: 'The LLM plugin stopped: the provider says the plan does not allow this model (HTTP 402). Change the judging model in Settings › Plugins › LLM or the key in ⚙ → System → Integrations & keys.',
    shape: 'The LLM plugin stopped: the model refused the request shape (HTTP 400). Change the judging model in Settings › Plugins › LLM or the key in ⚙ → System → Integrations & keys.',
  });
  function stopNotice(why) {
    if (!stop || !STOP_NOTICE[why]) return;
    const key = `decision-stop:${why}:${stop.sig.slice(0, 12)}`;
    if (noticedStop === key) return;
    try { const d = serverNotice?.(key, STOP_NOTICE[why], { level: 'warn', i18n: { key: STOP_NOTICE[why] } }); if (d !== 0) noticedStop = key; } catch { }
  }
  function quiet(use, why, extra = {}) {
    lastOutcome = { at: now(), use, outcome: 'refused', why };
    if (why === 'plan' || why === 'shape') stopNotice(why);
    const k = `${use}:${why}`;
    if (!(now() - (quietAt.get(k) || 0) < QUIET_MS)) { quietAt.set(k, now()); journal({ use, outcome: 'refused', why, ...extra }); }
    if (why === 'daily-budget' && noticedDay !== usage.day) {
      noticedDay = usage.day;
      try { serverNotice?.('decision-budget', 'The LLM plugin stopped for today: its daily budget is spent. It resumes tomorrow (⚙ → Plugins → LLM).', { level: 'warn' }); } catch { }
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
    if (stop && cred && stop.sig !== credSig(cred)) { stop = null; say('ok', 'a new key or model is saved: calls resume'); }
    const input = M.buildInput(use, parts);
    if (input.est > input.ceiling) return quiet(use, 'over-ceiling');            // the plan and the builder disagree — never sent
    const est = input.est + M.questionTokens(qs);
    const t = now();
    const { v, id, estUsd } = reserve(use, { s, cred, accountNever, est, perHour, t });   // budgetVerdict + the reservation, one step
    if (!v.ok) return quiet(use, v.why, v.retryAt ? { retryAt: v.retryAt } : {});
    const sent = M.scrubQuestions(qs);   // B-d375: a rule's condition / a choice's description are the owner's words — the ONE scrub
    const body = Object.freeze(M.buildRequest(cred.provider, { model: cred.model, input: input.text, questions: sent }));
    const bytes = new TextEncoder().encode(JSON.stringify(body));   // serialized ONCE — the bytes the one-shot stream sends (never a string body: lane judge-one-shot-body)
    const url = M.urlOf(cred.provider, baseUrlFor && baseUrlFor[cred.provider]);
    const reserved = Math.round(estUsd * 1e8) / 1e8;
    const base = { use, memo: key, dialect: cred.provider, model: cred.model, est, reserved, truncated: input.truncated, n, keyFp: sha(cred.key).slice(0, 6) };
    let status = 0, json = null, retryAfter = null, failed = null, sending = null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      // DECISION_ENDPOINT — the ONE vendor call (gates above: budgetVerdict, pluginOn, resolveIntegration(ROW_ID))
      sending = fetch(url, { method: 'POST', headers: { authorization: `Bearer ${cred.key}`, 'content-type': 'application/json', 'content-length': String(bytes.length) }, body: M.oneShotBody(bytes), duplex: 'half', signal: ac.signal, redirect: 'error' });   // a 3xx is never followed (lane rule-learning-fix L2)
      const res = await sending;
      status = res.status;
      if (status === 429 && res.headers && typeof res.headers.get === 'function') retryAfter = M.retryAfterMs(res.headers.get('retry-after'), now());
      if (res.ok) json = await res.json();
    } catch (e) { failed = sending ? M.fetchFailOf(e) : 'unsent'; } finally { clearTimeout(timer); }   // a body that never parsed keeps its 2xx status (and its reservation); nothing sent / a refused redirect releases it (L3)
    const u = json ? M.usageOf(cred.provider, json) : { inputTokens: 0, outputTokens: 0, costUsd: null };
    const usd = M.settleUsd({ status, usage: json ? u : null, reservedUsd: estUsd, pricePerMtok: M.PRICE_PER_MTOK_USD[cred.provider], failed });
    settle(id, use, u, usd, est);
    const spent = { inputTokens: u.inputTokens || undefined, usd };
    const halt = M.rowStopOf(status);   // B-2979: 401 / 403 the key, 402 the plan, 400 the shape — the ROW stops, not this record
    if (halt) {
      stop = { sig: credSig(cred), why: halt, status, at: now() };
      say(halt, halt === 'reconnect' ? `the provider refused the key (HTTP ${status}): no call until a new key is saved`
        : `${halt === 'plan' ? 'the provider says the plan does not allow' : 'the model refused the request shape of'} ${cred.model} (HTTP ${status}): no call until the key or the model changes`);
      stopNotice(halt);
      lastOutcome = { at: now(), use, outcome: halt, status };
      journal({ ...base, ...spent, outcome: halt, status });
      return { ok: false, why: halt, status };
    }
    if (failed === 'redirect') {   // lane rule-learning-fix L2: the provider's URL answered a 3xx — refused by name, never followed; paced like a wall
      backoff = M.nextBackoff(backoff, now(), 'wall');
      say('redirect', `the provider answered a redirect: not followed (never a request to another origin) — paused until ${new Date(backoff.until).toISOString()}`);
      lastOutcome = { at: now(), use, outcome: 'redirect', retryAt: backoff.until };
      journal({ ...base, ...spent, outcome: 'redirect' });
      return { ok: false, why: 'redirect', retryAt: backoff.until };
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
    if (stop) stop = null;
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
    // lane decision-attention-facts: an attention call's needs_now rides its journal line (`p`, 2 decimals); lane
    // dm-reply-infers: so does a reply judgment's score (the ledger keeps the yes and the no alike)
    const p = use === 'attention' && n === 1 ? M.needsNowP(answers) : use === 'reply-infer' && answers[0] ? answers[0].probability : undefined;
    journal({ ...base, outcome: 'ok', status, inputTokens: u.inputTokens, outputTokens: u.outputTokens, usd, hits, p });
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

  /** lane decision-spend-readout: the month so far for Settings › Spending — Σ usd of the journal's rows this local month,
   *  read from a BOUNDED tail (≤ 2 MB: the journal itself is cut at 5 000 lines / 30 days) and kept 60 s. */
  let monthMemo = { at: -Infinity, v: null };
  function monthSoFar() {
    if (now() - monthMemo.at < 60000) return monthMemo.v;
    let rows = [];
    try {
      const fd = fs.openSync(F.journal, 'r');
      try {
        const size = fs.fstatSync(fd).size, n = Math.min(size, 2 * 1024 * 1024), buf = Buffer.alloc(n);
        fs.readSync(fd, buf, 0, n, size - n);
        rows = buf.toString('utf8').split('\n').slice(n < size ? 1 : 0).map((l) => { try { return JSON.parse(l); } catch { return null; } });
      } finally { fs.closeSync(fd); }
    } catch { rows = []; }
    const v = M.monthSpend(rows, today().day.slice(0, 7), tzOffset);
    monthMemo = { at: now(), v };
    return v;
  }

  function status() {
    const s = settings();
    const cred = credential();
    const d = today();
    const held = stopOf(cred);
    return {
      configured: !!cred, provider: cred ? cred.provider : null, providerLabel: cred ? M.PROVIDER_LABEL[cred.provider] : null, model: cred ? cred.model : null, keySource: cred ? cred.source : null,
      features: s.features, dailyBudgetCents: s.dailyBudgetCents, threshold: s.threshold,
      today: { day: d.day, byUse: d.byUse, total: totalOf(d), reserved: Math.round(reservedUsd() * 1e8) / 1e8, inFlight: open.size },
      month: monthSoFar(),
      backoffUntil: backoff.until > now() ? backoff.until : 0, reconnect: held === 'reconnect' ? { status: stop.status, at: stop.at } : null, last: lastOutcome,
      stop: held ? { why: held, status: stop.status, at: stop.at } : null,   // lane decision-vendor-hygiene: the row stop that holds (reconnect | plan | shape)
      inbox: inboxLast,   // lane decision-inbox-rank: the For-you tray's last pass {at, judged, placed, stopped} — a stopped pass is said
    };
  }

  // ── use ④: the For-you pass (lane inbox-decision-group) ───────────────────
  let inbox = null, inboxTimer = null, inboxBusy = false, inboxOnWas = null, inboxLastPass = 0;
  let inboxBoard = null, inboxLast = null, inboxStopSaid = null;   // lane decision-inbox-rank: the board's reader; the last pass, as status() says it
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
  /** ONE pass: the facts of every open action item (free, whatever the switch), then ≤ `max` eligible band-5 TIES, one
   *  call each (refused ⇒ the pass stops, says why, and the next one retries). */
  async function inboxPass({ max = M.inputPlan('inbox').perPass } = {}) {
    if (!inbox || inboxBusy) return { ran: false, judged: 0 };
    const on = inboxOn();   // lane foryou-folds: the switch gates the JUDGE; the facts are free and the bands read them
    inboxBusy = true; inboxLastPass = now();
    let judged = 0, placed = 0, stopped = null, untied = 0;
    try {
      const t = now(), tz = tzOffset(t);
      let of = null;
      try { of = inboxBoard ? inboxBoard() : null; } catch (e) { log.warn?.(`[decision] For-you pass: the board was not read (${e.message}) — facts without it`); }
      const facts = [], eligible = [], open = inbox.openItems();
      for (const it of open) {
        if (it.kind === 'notice') continue;   // lane foryou-folds: every action row's facts (the bands read them), not only the judge's rows
        let b = null;
        try { b = of ? of(it.sessionKey) : null; } catch { b = null; }
        const f = M.inboxFacts(it, { now: t, board: b, tzOffsetMin: tz });
        facts.push([it.id, f]);
        const e = M.inboxEligible(it, t, f);
        if (e === 'placed') placed++;
        if (e === true) eligible.push([it, f]);
      }
      if (facts.length && typeof inbox.setFacts === 'function') inbox.setFacts(facts);
      if (!on) return { ran: false, judged: 0, facts: facts.length };
      // decision 3: only a band-5 TIE is the judge's — the rows read with the facts just written
      const fresh = new Map(facts);
      const tied = A.tieCandidates(open.map((it) => A.rowOf(fresh.has(it.id) ? { ...it, judged: { ...(it.judged || {}), facts: fresh.get(it.id) } } : it, t)), t);
      const due = eligible.filter(([it]) => tied.has(it.id));
      untied = eligible.length - due.length;
      for (const [it, f] of due.slice(0, max)) {
        const r = await judge('inbox', M.inboxScoreInput(it, f, t), { questions: [M.INBOX_QUESTION], memo: M.inboxMemoOf(it, sha, f) });
        if (!r.ok) { stopped = r.why || 'refused'; break; }
        const v = M.inboxVerdict(r.answers[0]);
        if (inbox.setJudged(it.id, { group: v ? v.group : null, why: v ? v.why : null, p: v ? v.p : null, at: now(), v: M.INBOX.version, facts: f, sig: M.inboxFactsSig(f) })) judged++;
      }
    } finally { inboxBusy = false; }
    inboxLast = { at: inboxLastPass, judged, placed, stopped, untied };
    if (stopped !== inboxStopSaid) { inboxStopSaid = stopped; if (stopped) log.warn?.(`[decision] For-you pass stopped after ${judged} judged: ${stopped} (the next pass retries in ${Math.round(M.INBOX.passMs / 60000)} min)`); }
    return { ran: true, judged, placed, stopped, untied };
  }
  function attachInbox(store, { tickMs = 60 * 1000, board = null } = {}) {
    inbox = store && typeof store.setJudged === 'function' && typeof store.openItems === 'function' ? store : null;
    inboxBoard = typeof board === 'function' ? board : null;
    if (!inbox) return;
    if (typeof inbox.setGrouping === 'function') inbox.setGrouping(grouping);
    inboxOnWas = inboxOn();
    if (tickMs > 0 && !inboxTimer) {
      inboxTimer = setInterval(() => { inboxSwitched(); if (now() - inboxLastPass >= M.INBOX.passMs) inboxPass().catch((e) => log.warn?.(`[decision] For-you pass failed: ${e.message}`)); }, tickMs);
      if (inboxTimer.unref) inboxTimer.unref();
    }
  }

  // ── THE LEDGER (lane rule-learning) — the budget door of the text-model client (header) ──
  const ledger = Object.freeze({
    settings,
    spentUsd: () => totalOf(today()).usd + reservedUsd(),
    useUsd: (use) => { const x = today().byUse[use]; return (x ? x.usd : 0) + [...open.values()].filter((r) => r.use === use).reduce((a, r) => a + r.usd, 0); },
    hold: (use, usd) => { const id = ++openSeq; open.set(id, { use, usd: Number(usd) || 0 }); return id; },
    settle: (id, use, u, usd, est) => settle(id, use, u, usd, est),
    journal: (o) => { lastOutcome = { at: now(), use: o.use, outcome: o.outcome, ...(o.why ? { why: o.why } : {}) }; journal(o); },
  });
  const textModel = require('./text-model-client.js').create({ integrations, ledger, fetchImpl, now, log, baseUrl: baseUrlFor && baseUrlFor.openrouter ? baseUrlFor.openrouter : null });

  return { judge, testRunner, status, attachPlugin, settings, memoSize: () => memo.size, files: F, ROW_ID, attachInbox, inboxPass, inboxSwitched, grouping, ledger, textModel };
}

module.exports = { create, ROW_ID, FEATURE_OF, TEST_SENTENCE };
