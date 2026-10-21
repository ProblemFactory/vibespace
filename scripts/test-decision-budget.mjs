#!/usr/bin/env node
// test-decision-budget — FAST (lane decision-verify-fixes: decision-verify r1 F1–F5; in-process, ZERO vendor calls).
// THE BILLED CAP RESERVES, THEN SETTLES: the REAL decision engine over a fake fetch that holds its answer until the
// test lets go (so judgments are really in flight together) and a fake clock:
//   ① the race: 6 concurrent judgments with room for ONE ⇒ exactly 1 fetch, 5 refused `daily-budget`; while it
//     flies status() shows the open reservation (the card's "today" = settled + reserved); the journal row says
//     reserved → settled;
//   ② the recorded cost gates: a provider answering usage.cost = 3 USD ⇒ the next call is refused under a 1 USD cap;
//   ③ a 200 without usage ⇒ the reservation stays as the cost (never 0); an answered 5xx costs 0;
//   ④ a 401 ⇒ `reconnect` + NO fetch across 3 ticks; a new key resumes;
//   ⑤ a 429 Retry-After is honoured to the ms; a 5xx waits 1 min, then 5;
//   ⑥ the per-hour guard rides the same reservation (6 in flight, perHour 1 ⇒ 1 fetch) + the preJudge rule-hour
//     slot is reserved before its await (source census: decision-verify F5);
//   ⑦ RED CONTROLS (scripts/mutant-copy.mjs): the reservation never written (the old read-then-write) ⇒ 6 fetches;
//     the settle back to the estimate (the old gate) ⇒ the 3 USD answer does not stop the next call;
//   ⑧ NOTHING SENT ⇒ RELEASED, NEVER SETTLED (lane rule-learning-fix L3) — the judge AND the text client share ONE rule
//     (M.fetchFailOf + settleUsd's `failed`): a primitive that throws before it returns, a refused / unresolvable
//     connection (+ a REAL closed loopback port), a refused redirect ⇒ $0 for both; a timeout / a reset mid-answer
//     (it may have been judged) keep the reservation — RED: settleUsd without `failed` charges all of them again.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DE = require(path.join(REPO, 'src/server/decision-engine.js'));
const M = require(path.join(REPO, 'src/decision-model.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('decision-budget');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

const Q = [{ type: 'predicate', name: 'q1', instructions: 'Does the text ask the reader to pay something?' }];
const BODY = 'Please pay the March invoice before Friday.';
const EST = M.buildInput('rule', { body: BODY, thread: [] }).est + M.questionTokens(Q);   // the engine's own estimate
const EST_USD = EST * M.rateOf(null, M.PRICE_PER_MTOK_USD.openai);

/** A world: an engine over a fake fetch. `answer(n)` → {status, body?, headers?}; `hold` keeps every answer until release(). */
// the judge's request body is a ONE-SHOT stream (lane judge-one-shot-body) — a fake reads it like the wire does
const bodyText = (init) => (typeof init.body === 'string' ? init.body : new Response(init.body).text());
function world(name, { Engine = DE, provider = 'openai', cents = 100, answer = () => ({ status: 200 }), hold = false } = {}) {
  const dataDir = path.join(ROOT, name); fs.mkdirSync(dataDir, { recursive: true });
  const w = { fetches: 0, T: Date.UTC(2026, 9, 13, 12, 0), key: 'sk-dummy-KEY-one', cents, waiting: [] };
  w.release = () => { for (const r of w.waiting.splice(0)) r(); };
  const fakeFetch = async (url, init) => {
    const n = ++w.fetches;
    if (hold) await new Promise((r) => w.waiting.push(r));
    const a = answer(n, JSON.parse(await bodyText(init)));
    const h = Object.fromEntries(Object.entries(a.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    return { status: a.status, ok: a.status >= 200 && a.status < 300, headers: { get: (k) => h[String(k).toLowerCase()] ?? null }, json: async () => { if (a.body === undefined) throw new Error('no body'); return a.body; } };
  };
  w.eng = Engine.create({ dataDir, fetchImpl: fakeFetch, now: () => w.T, tzOffset: () => 0, log: quiet,
    integrations: { resolveIntegration: () => ({ values: { provider, apiKey: w.key, model: '' }, source: 'user' }) } });
  w.eng.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: w.cents }) }); // lane plugin-settings-p0: the settings rows
  w.judge = (opts = {}) => w.eng.judge('rule', { body: BODY, thread: [] }, { questions: Q, ...opts });
  w.journal = () => fs.readFileSync(w.eng.files.journal, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return w;
}
const okBody = (usage) => ({ answers: [{ type: 'predicate', name: 'q1', probability: 0.8 }], ...(usage ? { usage } : {}) });
const roomForOne = EST_USD * 1.5 * 100;   // cents: one estimate fits, two do not

console.log(`① the race — 6 in flight, room for one (estimate ${EST} tokens = ${EST_USD} USD)`);
{
  const w = world('race', { cents: roomForOne, hold: true, answer: () => ({ status: 200, body: okBody({ input_tokens: EST }) }) });
  const all = Array.from({ length: 6 }, () => w.judge());
  await new Promise((r) => setImmediate(r));
  const st = w.eng.status();
  ok(w.fetches === 1 && st.today.inFlight === 1 && st.today.reserved > 0 && st.today.total.usd === 0, 'in flight: ONE fetch, one open reservation (the card counts it: settled 0 + reserved)', { fetches: w.fetches, today: st.today });
  w.release();
  const rs = await Promise.all(all);
  ok(rs.filter((r) => r.ok).length === 1 && rs.filter((r) => !r.ok && r.why === 'daily-budget').length === 5 && w.fetches === 1, '6 judgments ⇒ 1 call + 5 refused by the budget words (daily-budget)', rs.map((r) => r.why || 'ok'));
  const row = w.journal().find((x) => x.outcome === 'ok');
  ok(row && row.reserved > 0 && row.usd === row.reserved && w.eng.status().today.inFlight === 0, 'the journal row says reserved → settled (no usage.cost: the larger of the reservation and tokens × price)', row);
}

console.log('② the recorded cost gates (OpenRouter usage.cost = 3 USD under a 1 USD cap)');
{
  const w = world('cost', { provider: 'openrouter', answer: (n, b) => ({ status: 200, body: { model: b.model, answers: { q1: { type: 'noul', noul: 0.2 } }, usage: { input_tokens: 40, cost: 3 } } }) });
  const r1 = await w.judge();
  const r2 = await w.judge();
  ok(r1.ok && r1.usd === 3 && !r2.ok && r2.why === 'daily-budget' && w.fetches === 1 && w.eng.status().today.total.usd === 3, 'call 1 settles at 3 USD; call 2 is refused (0 fetches)', { r1: r1.usd, r2, fetches: w.fetches });
}

console.log('③ a 200 without usage keeps the reservation; an answered 5xx costs 0');
{
  const w = world('nousage', { answer: (n) => n === 1 ? { status: 200, body: okBody(null) } : { status: 503 } });
  const r1 = await w.judge();
  const t1 = w.eng.status().today.total;
  ok(r1.ok && t1.usd > 0 && Math.abs(t1.usd - EST_USD) < 1e-8 && t1.calls === 1 && t1.inputTokens === EST, 'no usage ⇒ the estimate is the cost (never 0)', t1);
  const r2 = await w.judge();
  const t2 = w.eng.status().today.total;
  ok(!r2.ok && r2.status === 503 && t2.usd === t1.usd && t2.calls === 1 && w.eng.status().today.reserved === 0, 'a 503 ⇒ the reservation released, nothing billed', { r2, t2 });
  ok(r2.retryAt === w.T + 60000, '…and a 5xx waits 1 min', r2);
}

console.log('④ a 401 ⇒ reconnect; no fetch across 3 ticks; a new key resumes');
{
  const w = world('auth', { answer: () => (w.key === 'sk-dummy-KEY-one' ? { status: 401 } : { status: 200, body: okBody({ input_tokens: 9 }) }) });
  const r1 = await w.judge();
  ok(!r1.ok && r1.why === 'reconnect' && r1.status === 401 && w.fetches === 1, 'the 401 ⇒ why reconnect', r1);
  const later = [];
  for (let i = 0; i < 3; i++) { w.T += 15 * 60e3; later.push(await w.judge()); }
  const st = w.eng.status();
  ok(w.fetches === 1 && later.every((r) => r.why === 'reconnect') && st.reconnect && st.reconnect.status === 401 && st.today.total.usd === 0, '3 ticks later: still 1 fetch, every refusal named reconnect, the card row says it, nothing billed', { later, reconnect: st.reconnect });
  w.key = 'sk-dummy-KEY-two';
  const r5 = await w.judge();
  ok(r5.ok && w.fetches === 2 && w.eng.status().reconnect === null, 'a new key saved ⇒ the next call goes and the row is clear', r5);
}

console.log('⑤ a 429 Retry-After is honoured; the 5xx ladder');
{
  const w = world('retry', { answer: (n) => n === 1 ? { status: 429, headers: { 'Retry-After': '7' } } : n <= 3 ? { status: 502 } : { status: 200, body: okBody({ input_tokens: 9 }) } });
  const r1 = await w.judge();
  ok(!r1.ok && r1.why === 'backoff' && r1.retryAt === w.T + 7000, 'Retry-After: 7 ⇒ backoff until now + 7 s', r1);
  w.T += 6999;
  const r2 = await w.judge();
  ok(!r2.ok && r2.why === 'backoff' && w.fetches === 1, 'at 6.999 s: 0 fetches', r2);
  w.T += 1;
  const r3 = await w.judge();
  ok(!r3.ok && r3.status === 502 && w.fetches === 2 && r3.retryAt === w.T + 300000, 'at 7 s: one call; its 502 (a second wall) waits 5 min', r3);
  w.T += 300000;
  const r4 = await w.judge();
  ok(!r4.ok && r4.retryAt === w.T + 900000, 'a third wall waits 15 min', r4);
  w.T += 900000;
  ok((await w.judge()).ok && w.fetches === 4, 'after it: the call goes through');
}

console.log('⑥ the per-hour guard rides the same reservation');
{
  const w = world('hour', { hold: true, answer: () => ({ status: 200, body: okBody({ input_tokens: 9 }) }) });
  const all = Array.from({ length: 6 }, () => w.judge({ perHour: 1 }));
  await new Promise((r) => setImmediate(r));
  w.release();
  const rs = await Promise.all(all);
  ok(w.fetches === 1 && rs.filter((r) => r.why === 'per-hour').length === 5, '6 in flight, perHour 1 ⇒ 1 fetch + 5 per-hour', rs.map((r) => r.why || 'ok'));
  const src = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const pj = src.slice(src.indexOf('async function preJudge('), src.indexOf('async function onFresh('));
  const reserveAt = pj.indexOf('hrs.push(t);'), awaitAt = pj.indexOf('await decisionEngine.judge(');
  const checkAt = pj.indexOf('const road = roadOf(facts[F.isRouteRule(rule) ? \'routing\' : \'rule\'], hrs.length >= F.decisionPerHour(rule), F.decisionPerHour(rule));');   // lane judged-watch-state: the hour rides THE road verdict
  ok(reserveAt > 0 && awaitAt > reserveAt && checkAt > 0 && checkAt < reserveAt && /a\.lastIndexOf\(t\)/.test(pj) && !/decisionHours\.get\(k\)\.push\(t\)/.test(pj), 'preJudge: the rule\'s hour slot is reserved right after its check, BEFORE the await, and handed back on a refusal / memo (F5)');
}

console.log('⑦ RED CONTROLS — the old shapes in scratch copies');
{
  const MUT = mutantCopies('decision-budget', REPO);
  const engSrc = fs.readFileSync(path.join(REPO, 'src/server/decision-engine.js'), 'utf8');
  const a1 = '    open.set(id, { use, usd: estUsd });\n';
  ok(engSrc.split(a1).length === 2, 'ANCHOR: the reservation is written once');
  const NoReserve = MUT.load('src/server/decision-engine.js', engSrc.replace(a1, '\n'), 'no-reserve');
  const w = world('ctl-race', { Engine: NoReserve, cents: roomForOne, hold: true, answer: () => ({ status: 200, body: okBody({ input_tokens: EST }) }) });
  const all = Array.from({ length: 6 }, () => w.judge());
  await new Promise((r) => setImmediate(r));
  w.release(); await Promise.all(all);
  ok(w.fetches === 6, `CONTROL: read-then-write (no reservation) ⇒ ${w.fetches} fetches — leg ① would be red`);
  const a2 = 'const usd = M.settleUsd({ status, usage: json ? u : null, reservedUsd: estUsd, pricePerMtok: M.PRICE_PER_MTOK_USD[cred.provider], failed });';
  ok(engSrc.split(a2).length === 2, 'ANCHOR: the settle line');
  const Est = MUT.load('src/server/decision-engine.js', engSrc.replace(a2, 'const usd = estUsd;'), 'settle-estimate');
  const w2 = world('ctl-cost', { Engine: Est, provider: 'openrouter', answer: (n, b) => ({ status: 200, body: { model: b.model, answers: { q1: { type: 'noul', noul: 0.2 } }, usage: { input_tokens: 40, cost: 3 } } }) });
  await w2.judge(); const r2 = await w2.judge();
  ok(r2.ok && w2.fetches === 2, 'CONTROL: settled at the estimate (the recorded cost ignored) ⇒ the 2nd call flies — leg ② would be red');
}

console.log('⑧ nothing sent ⇒ released, never settled — the judge AND the text client (lane rule-learning-fix L3)');
{
  const KEYOR = ['sk-or-v1-', 'b'.repeat(40)].join('');
  const fetchFailed = (cause) => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause }));
  const coded = (msg, code) => Object.assign(new Error(msg), { code });
  const closed = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  let n = 0;
  /** one judgment + one draft through the SAME engine over `fetchImpl` → what each use was charged */
  const both = async (fetchImpl, baseUrl = null) => {
    const dataDir = path.join(ROOT, `l3-${++n}`); fs.mkdirSync(dataDir, { recursive: true });
    const e = DE.create({ dataDir, ...(fetchImpl ? { fetchImpl } : {}), ...(baseUrl ? { baseUrlFor: { openrouter: baseUrl } } : {}), now: () => Date.UTC(2026, 9, 13, 12), tzOffset: () => 0, log: quiet,
      integrations: { resolveIntegration: () => ({ values: { provider: 'openrouter', apiKey: KEYOR, model: '' }, source: 'user' }) } });
    e.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: 100, learnModel: 'flash' }) });
    const j = await e.judge('rule', { body: BODY, thread: [] }, { questions: Q });
    const l = await e.textModel.complete({ use: 'learn', messages: [{ role: 'user', content: 'x' }], schema: {}, est: 500 });
    const d = e.status().today;
    return { judge: d.byUse.rule ? d.byUse.rule.usd : 0, learn: d.byUse.learn ? d.byUse.learn.usd : 0, reserved: d.reserved, inFlight: d.inFlight, why: [j.why, l.why] };
  };
  const UNSENT = {
    'the primitive throws before it returns': () => { throw new Error('boom'); },
    'a refused connection (ECONNREFUSED)': () => fetchFailed(coded('connect ECONNREFUSED 127.0.0.1:9', 'ECONNREFUSED')),
    'an unresolvable host (ENOTFOUND)': () => fetchFailed(coded('getaddrinfo ENOTFOUND openrouter.invalid', 'ENOTFOUND')),
    'a refused redirect (undici: unexpected redirect)': () => fetchFailed(new Error('unexpected redirect')),
  };
  const MAYBE = {
    'a timeout (the abort)': () => Promise.reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })),
    'a reset mid-answer': () => fetchFailed(coded('other side closed', 'UND_ERR_SOCKET')),
  };
  const run = async (table) => { const out = {}; for (const [k, f] of Object.entries(table)) out[k] = await both(f); return out; };
  const u = await run(UNSENT);
  ok(Object.values(u).every((x) => x.judge === 0 && x.learn === 0 && x.reserved === 0 && x.inFlight === 0), `${Object.keys(UNSENT).length} ways nothing was sent (${Object.keys(UNSENT).join(' · ')}) ⇒ the judge's use and the drafter's use are charged $0, no hold left`, u);
  const real = await both(null, `http://127.0.0.1:${closed}`);
  ok(real.judge === 0 && real.learn === 0 && real.reserved === 0, `the REAL primitive on a closed loopback port (${closed}) ⇒ $0 for both callers (the connect-phase code read off the cause)`, real);
  const m = await run(MAYBE);
  ok(Object.values(m).every((x) => x.judge > 0 && x.learn > 0 && x.reserved === 0), 'a timeout and a reset mid-answer may have reached the vendor ⇒ both keep their reservation as the cost (the money law of ③ unchanged)', m);
  const orig = M.settleUsd;
  M.settleUsd = (o) => orig({ ...o, failed: null });   // RED CONTROL on the shared model object (both callers call it at call time)
  let red;
  try { red = await run(UNSENT); } finally { M.settleUsd = orig; }
  ok(Object.values(red).every((x) => x.judge > 0 && x.learn > 0), 'RED CONTROL: settleUsd without `failed` (the old rule) charges the reservation for every one of them — to both uses', red);
}

console.log('⑨ THE JUDGING MODEL ON THE WIRE (lane llm-plugin-rename): the LLM plugin\'s judgeModel row > the cluster preset\'s model (only while the cluster\'s key is in use) > the provider\'s default');
{
  const wire = (tag, { settings = {}, values = {}, source = 'user' } = {}) => {
    const dataDir = path.join(ROOT, 'model-' + tag); fs.mkdirSync(dataDir, { recursive: true });
    const seen = [];
    const eng = DE.create({ dataDir, now: () => Date.UTC(2026, 9, 14, 12, 0), tzOffset: () => 0, log: quiet,
      fetchImpl: async (url, init) => { seen.push(JSON.parse(await bodyText(init)).model); return { status: 200, ok: true, headers: { get: () => null }, json: async () => okBody({ input_tokens: 40 }) }; },
      integrations: { resolveIntegration: () => ({ values: { provider: 'openrouter', apiKey: 'sk-dummy-KEY-' + tag, ...values }, source }) } });
    eng.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: 100, ...settings }) });
    return { eng, seen, judge: () => eng.judge('rule', { body: BODY, thread: [] }, { questions: Q, memo: { id: 'jm-' + tag, rule: 'r' } }) };
  };
  const a = wire('row', { settings: { judgeModel: 'openai/gpt-6-luna' }, values: { model: 'typesafe/jev-router' }, source: 'cluster' });
  await a.judge();
  const b = wire('preset', { values: { model: 'typesafe/jev-router' }, source: 'cluster' });
  await b.judge();
  const c = wire('own', { values: { model: 'typesafe/jev-router' }, source: 'user' });
  await c.judge();
  const d = wire('blank', { settings: { judgeModel: '   ' } });
  await d.judge();
  ok(a.seen.join() === 'openai/gpt-6-luna' && a.eng.status().model === 'openai/gpt-6-luna', `the plugin's judgeModel row is the model on the wire, over the preset's (${a.seen})`);
  ok(b.seen.join() === 'typesafe/jev-router', `no row ⇒ the cluster preset's model while the cluster's key is in use (${b.seen})`);
  ok(c.seen.join() === M.DEFAULT_MODEL.openrouter && d.seen.join() === M.DEFAULT_MODEL.openrouter, `the person's OWN key never borrows a model from its values (a card's old field) — the provider's default; a blank row is the default too (${c.seen} · ${d.seen})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
