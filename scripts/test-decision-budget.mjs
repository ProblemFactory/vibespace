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
//   ⑩ THE LOOP NEVER WAITS ON THE DECISION FILES (lane lg-store-writes, B-0248 U1): over a writer stand-in that lands
//     nothing until told, a call that changed the counter has not answered while the counter waits and neither file
//     is on disk; the day's counter is an ACT (decision-usage.write, rank 0, 0600, durable() asked) — the CALL waits
//     for it, never the loop —, the memo PACED (decision-memo.write); the bytes are the state when the write is due; a
//     FAILED write is said ONCE and the next landing once; a new engine reads both back; an engine made again while a
//     write is owed lands it first; a memo hit waits on nothing; the TEXT-MODEL CLIENT (the drafter) has not answered
//     while its counter is owed — RED (mutant copies): the writes made on the main thread at the change ⇒ the files are
//     there at once; the drafter's settle not awaited ⇒ it answers while its counter is owed.
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
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('decision-budget');
// lane lg-store-writes (B-0248 U1): the engine's memo is the STORE WRITER's (paced) — its owed writes land before the scratch
// dir goes (a write on the writer's thread never races the removal: no folder left behind)
process.on('exit', () => { try { require(path.join(REPO, 'src/store-writer.js')).storeWriter().flushSync(); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

const Q = [{ type: 'predicate', name: 'q1', instructions: 'Does the text ask the reader to pay something?' }];
const BODY = 'Please pay the March invoice before Friday.';
const EST = M.buildInput('rule', { body: BODY, thread: [] }).est + M.questionTokens(Q);   // the engine's own estimate
const EST_USD = EST * M.rateOf(null, M.PRICE_PER_MTOK_USD.openai);

/** A world: an engine over a fake fetch. `answer(n)` → {status, body?, headers?}; `hold` keeps every answer until release(). */
// the judge's request body is a ONE-SHOT stream (lane judge-one-shot-body) — a fake reads it like the wire does
const bodyText = (init) => (typeof init.body === 'string' ? init.body : new Response(init.body).text());
function world(name, { Engine = DE, provider = 'openai', cents = 100, answer = () => ({ status: 200 }), hold = false, writer = null, log = quiet } = {}) {
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
  w.mk = () => Engine.create({ dataDir, fetchImpl: fakeFetch, now: () => w.T, tzOffset: () => 0, log, ...(writer ? { writer } : {}),
    integrations: { resolveIntegration: () => ({ values: { provider, apiKey: w.key, model: '' }, source: 'user' }) } });
  w.eng = w.mk();
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
  for (let k = 0; k < 600 && w.fetches < 1; k++) await new Promise((r) => setTimeout(r, 5));   // B-0248's next part: a call is asked once its reservation line is on disk (the writer's thread) — waited for, bounded
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
  for (let k = 0; k < 600 && w.fetches < 1; k++) await new Promise((r) => setTimeout(r, 5));   // B-0248's next part: a call is asked once its reservation line is on disk (the writer's thread) — waited for, bounded
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
  const NoReserve = MUT.load('src/server/decision-engine.js', editAnchor(engSrc, a1, '\n', "src/server/decision-engine.js"), 'no-reserve');
  const w = world('ctl-race', { Engine: NoReserve, cents: roomForOne, hold: true, answer: () => ({ status: 200, body: okBody({ input_tokens: EST }) }) });
  const all = Array.from({ length: 6 }, () => w.judge());
  for (let k = 0; k < 600 && w.fetches < 6; k++) await new Promise((r) => setTimeout(r, 5));   // B-0248's next part: a call is asked once its reservation line is on disk (the writer's thread) — waited for, bounded
  w.release(); await Promise.all(all);
  ok(w.fetches === 6, `CONTROL: read-then-write (no reservation) ⇒ ${w.fetches} fetches — leg ① would be red`);
  const a2 = 'const usd = M.settleUsd({ status, usage: json ? u : null, reservedUsd: estUsd, pricePerMtok: M.PRICE_PER_MTOK_USD[cred.provider], failed });';
  ok(engSrc.split(a2).length === 2, 'ANCHOR: the settle line');
  const Est = MUT.load('src/server/decision-engine.js', editAnchor(engSrc, a2, 'const usd = estUsd;', "src/server/decision-engine.js"), 'settle-estimate');
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

console.log('⑩ the loop never waits on the decision files — the memo PACED, the day\'s counter an ACT whose call waits for it, both through the store writer (lane lg-store-writes, B-0248 U1)');
{
  /** a store writer stand-in: it lands NOTHING until told (land), fails a write when told (failNow), answers durable() then */
  const standIn = () => {
    const r = { dirties: [], durables: [], flushes: [], owed: new Map(), cbs: new Map(), waiters: [], journal: 0 };
    // B-0248's next part: the decision JOURNAL is a store of the writer too — in this stand-in it lands AT ONCE (its own laws, the
    // reservation before the ask, are test-decision-journal's); the counter and the memo keep this stand-in's held landing
    const JOURNAL = 'decision-journal.jsonl';
    r.dirty = (file, o) => { if (path.basename(file) === JOURNAL) { r.journal++; const b = o.produce({}); if (b && b.append !== undefined) fs.appendFileSync(file, b.append); else if (b != null) throw new Error('the journal stand-in writes appends only'); if (o.onWritten) o.onWritten(true, null); return; } r.dirties.push({ file, name: o.name, rank: o.rank, mode: o.mode }); r.owed.set(file, o.produce); if (o.onWritten) r.cbs.set(file, o.onWritten); };
    r.durable = (file) => { if (path.basename(file) === JOURNAL) return Promise.resolve(true); r.durables.push(file); return new Promise((res) => r.waiters.push({ file, res })); };
    r.whyNotDurable = () => ({ why: 'failed' });
    r.pending = (file) => r.owed.has(file);
    r.answer = (file, v) => { r.waiters = r.waiters.filter((w) => (w.file === file ? (w.res(v), false) : true)); };
    r.land = (files = [...r.owed.keys()]) => { for (const f of files) { const pr = r.owed.get(f); if (!pr) continue; fs.writeFileSync(f, pr()); r.owed.delete(f); const cb = r.cbs.get(f); if (cb) cb(true, null); r.answer(f, true); } };
    r.failNow = (file) => { const cb = r.cbs.get(file); if (cb) cb(false, Object.assign(new Error('planted'), { code: 'EIO' })); r.answer(file, false); };
    r.flushSync = (files) => { r.flushes.push(files.map((f) => path.basename(f)).sort()); r.land(files); return { written: files, left: [] }; };
    return r;
  };
  const tick = () => new Promise((res) => setImmediate(res));
  const until = async (fn) => { for (let k = 0; k < 200 && !fn(); k++) await tick(); return fn(); };
  const cost = (n, b) => ({ status: 200, body: { model: b.model, answers: { q1: { type: 'noul', noul: 0.2 } }, usage: { input_tokens: 40, cost: 0.01 } } });
  const mkW = (Engine, tag) => {
    const rec = standIn(), warns = [];
    const w = world('sw-' + tag, { Engine, writer: rec, provider: 'openrouter', answer: cost, log: { log() { }, warn: (l) => warns.push(String(l)), error() { } } });
    return { w, rec, warns, F: w.eng.files };
  };
  /** one call, started: → {p, done(), wrote(n)} — `wrote(n)` waits until n durable() asks were made */
  const start = (x, id) => { let done = false; const n0 = x.rec.durables.length; const p = x.w.judge({ memo: { id, rule: 'r' } }).then((r) => { done = true; return r; }); return { p, done: () => done, asked: () => until(() => x.rec.durables.length >= n0 + 2) }; };
  const a = mkW(DE, 'moved');
  const c1 = start(a, 'sw-1');
  await c1.asked(); await tick(); await tick();
  const onDisk = [a.F.usage, a.F.memo].filter((f) => fs.existsSync(f)).map((f) => path.basename(f));
  ok(!c1.done() && onDisk.length === 0, 'a call that changed the counter has NOT answered while its counter waits for the disk — and neither decision-usage.json nor decision-memo.json was written on the main thread', { done: c1.done(), onDisk });
  const u = a.rec.dirties.filter((d) => d.file === a.F.usage), m = a.rec.dirties.filter((d) => d.file === a.F.memo);
  ok(u.length === 2 && u.every((d) => d.name === 'decision-usage.write' && d.rank === 0 && d.mode === 0o600) && a.rec.durables.filter((f) => f === a.F.usage).length === 2,
    'the day\'s counter is an ACT: handed as decision-usage.write, rank 0, 0600, its durable() asked — at the settle and at the recorded rate', u);
  ok(m.length === 1 && m[0].name === 'decision-memo.write' && m[0].rank === undefined && m[0].mode === 0o600 && !a.rec.durables.includes(a.F.memo), 'the memo is PACED: handed as decision-memo.write — no rank, no durable()', m);
  const ub = JSON.parse(a.rec.owed.get(a.F.usage)()), mb = JSON.parse(a.rec.owed.get(a.F.memo)());
  ok(ub.byUse.rule.calls === 1 && ub.byUse.rule.usd === 0.01 && mb.entries.length === 1, 'the bytes are the state when the write is due: the counter (1 call, 0.01 USD) and the memo (1 entry)', { ub, n: mb.entries.length });
  a.rec.failNow(a.F.usage);
  const r1 = await c1.p;
  const c2 = start(a, 'sw-2'); await c2.asked(); a.rec.failNow(a.F.usage); await c2.p;
  const owedSaid = a.warns.filter((l) => /the day's counter is not on disk \(its write failed: EIO\)/.test(l)).length;
  const c3 = start(a, 'sw-3'); await c3.asked(); a.rec.land(); await c3.p;
  const againSaid = a.warns.filter((l) => /the day's counter is on disk again/.test(l)).length;
  ok(r1.ok && owedSaid === 1 && againSaid === 1 && a.warns.length === 2, `a counter write that FAILED is said ONCE over two failed writes (${owedSaid}), the next write that lands says so once (${againSaid}) — the call still answers (the change is kept in memory)`, a.warns);
  const e2 = a.w.mk();
  ok(e2.status().today.total.calls === 3 && e2.memoSize() === 3 && a.rec.flushes.length === 0, 'a new engine reads the landed counter (3 calls) and memo (3 entries) back — and waits on nothing (nothing owed)', { calls: e2.status().today.total.calls, memo: e2.memoSize(), flushes: a.rec.flushes });
  e2.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: a.w.cents }) });
  a.w.eng = e2;
  const c4 = start(a, 'sw-4'); await c4.asked();
  const e3 = a.w.mk();
  await c4.p;
  ok(a.rec.flushes.length === 1 && a.rec.flushes[0].join() === 'decision-memo.json,decision-usage.json' && e3.status().today.total.calls === 4 && e3.memoSize() === 4,
    'an engine made AGAIN while its writes are owed (a suite\'s restart) lands exactly those two first, then reads them (4 calls, 4 entries)', { flushes: a.rec.flushes, calls: e3.status().today.total.calls, memo: e3.memoSize() });
  e3.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: a.w.cents }) });
  a.w.eng = e3;
  const asks = a.rec.durables.length, fetches = a.w.fetches;
  const hit = await Promise.race([a.w.judge({ memo: { id: 'sw-1', rule: 'r' } }), new Promise((res) => setTimeout(() => res('waited'), 500))]);
  ok(hit && hit.ok && hit.memo === true && a.w.fetches === fetches && a.rec.durables.length === asks, 'a memo hit changes no counter and waits on nothing (no durable() asked, no fetch)', hit);
  // the TEXT-MODEL CLIENT (the drafter) keeps the same law (reader round 1): its answer waits for the counter its call changed
  const tmLeg = async (TMmod, tag) => {
    const rec = standIn(), dataDir = path.join(ROOT, 'sw-tm-' + tag); fs.mkdirSync(dataDir, { recursive: true });
    const KEYTM = ['sk-or-v1-', 'c'.repeat(40)].join('');
    const integrations = { resolveIntegration: () => ({ values: { provider: 'openrouter', apiKey: KEYTM, model: '' }, source: 'user' }) };
    const fetchImpl = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 40, completion_tokens: 5, cost: 0.002 } }) });
    const e = DE.create({ dataDir, writer: rec, fetchImpl, now: () => Date.UTC(2026, 9, 13, 12), tzOffset: () => 0, log: quiet, integrations });
    e.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ rules: true, dailyBudgetCents: 100, learnModel: 'flash' }) });
    const tm = TMmod.create({ integrations, ledger: e.ledger, fetchImpl, now: () => Date.UTC(2026, 9, 13, 12), log: quiet });
    let done = false;
    const p = tm.complete({ use: 'learn', messages: [{ role: 'user', content: 'x' }], schema: {}, est: 500 }).then((r) => { done = true; return r; });
    await until(() => rec.durables.length >= 1); await tick(); await tick();
    const waited = !done;
    rec.land(); const r = await p;
    return { waited, ok: r.ok, why: r.why, asked: rec.durables.length, usd: e.status().today.byUse.learn ? e.status().today.byUse.learn.usd : 0 };
  };
  const t1 = await tmLeg(require(path.join(REPO, 'src/server/text-model-client.js')), 'moved');
  ok(t1.waited && t1.ok && t1.asked >= 1 && t1.usd > 0, 'the text-model client (the drafter) has NOT answered while the counter its call changed waits for the disk — it answers once the counter lands', t1);
  const tmSrc = fs.readFileSync(path.join(REPO, 'src/server/text-model-client.js'), 'utf8');
  const aT = '    await ledger.settle(hold, use, u, usd, est);';
  ok(tmSrc.split(aT).length === 2, 'ANCHOR: the text-model client awaits its settle, once');
  const TMno = mutantCopies('decision-budget-tm', REPO).load('src/server/text-model-client.js', editAnchor(tmSrc, aT, '    ledger.settle(hold, use, u, usd, est);', "src/server/text-model-client.js"), 'no-await');
  const t2 = await tmLeg(TMno, 'red');
  ok(!t2.waited && t2.ok, 'CONTROL: the settle not awaited ⇒ the drafter answers while its counter is still owed — the check above would be red', t2);
  // RED CONTROL: the change removed — the writes made on the main thread at the change (the old writeJsonAtomic shape)
  const engSrc = fs.readFileSync(path.join(REPO, 'src/server/decision-engine.js'), 'utf8');
  const a3 = "  const W = () => writer || require('../store-writer.js').storeWriter();\n";
  ok(engSrc.split(a3).length === 2, 'ANCHOR: the engine\'s one writer line');
  const syncShim = "  const W = () => ({ dirty: (f, o) => fs.writeFileSync(f, o.produce(), { mode: 0o600 }), durable: async () => true, whyNotDurable: () => null, pending: () => false, flushSync: () => ({ written: [], left: [] }) });\n";
  const Sync = mutantCopies('decision-budget-sw', REPO).load('src/server/decision-engine.js', editAnchor(engSrc, a3, syncShim, "src/server/decision-engine.js"), 'sync-writes');
  const b = mkW(Sync, 'red');
  const rb = await b.w.judge({ memo: { id: 'sw-red', rule: 'r' } });
  const bDisk = [b.F.usage, b.F.memo].filter((f) => fs.existsSync(f)).map((f) => path.basename(f));
  ok(rb.ok && bDisk.length === 2 && b.rec.dirties.length === 0, `CONTROL: the writes made on the main thread at the change ⇒ both files are on disk when the call returns (${bDisk.join(', ')}), the writer never asked — the leg's first checks would be red`);
}

// ── B-a85f: THE DAY'S COUNTER IS REBUILT FROM THE JOURNAL AT BOOT (the money crash window of B-0248 U1) ────────────────────
// A billed call's journal lines (its reservation, then its result — B-0248's next part) land through the writer; its counter goes
// through it too. A stop before the COUNTER's write lands (here: a writer that writes the journal and never the counter) left it short — the next calls could spend past the daily budget by that
// much. The next engine raises each use to at least the journal's sum for today (never lowers it). RED (anchored): a copy
// without the rebuild starts the day at 0.
console.log('B-a85f — a stop before the counter landed: the next boot raises the day\'s counter to the journal\'s sum');
{
  const { anchored } = await import('./scratch.mjs');
  const JN = 'decision-journal.jsonl';
  const never = { dirty(f, o) { if (path.basename(f) !== JN) return; const b = o.produce({}); if (b && b.append !== undefined) fs.appendFileSync(f, b.append); if (o.onWritten) o.onWritten(true, null); },   // the journal lands, the counter never
    durable: (f) => Promise.resolve(path.basename(f) === JN), whyNotDurable: () => null, pending: () => false, flushSync: () => ({ written: [], left: [], ms: 0 }), stats: () => [] };
  const scene = async (Engine, name) => {
    const w = world(name, { writer: never, answer: () => ({ status: 200, body: okBody({ input_tokens: 9 }) }) });
    const r1 = await w.judge(); const r2 = await w.judge({ memo: false });
    const billed = w.journal().filter((x) => (Number(x.usd) || 0) > 0).reduce((a, x) => a + Number(x.usd), 0);
    const onDisk = fs.existsSync(w.eng.files.usage);
    const eng2 = Engine.create({ dataDir: path.dirname(w.eng.files.usage), fetchImpl: async () => { throw new Error('no call'); }, now: () => w.T, tzOffset: () => 0, log: quiet, writer: never,
      integrations: { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: w.key, model: '' }, source: 'user' }) } });
    const t = eng2.status().today.total;
    return { ok1: !!(r1 && r1.ok), ok2: !!(r2 && r2.ok), billed: Math.round(billed * 1e8) / 1e8, onDisk, usd: Math.round(t.usd * 1e8) / 1e8, calls: t.calls };
  };
  const a = await scene(DE, 'a85f-rebuild');
  ok(a.ok1 && a.billed > 0 && !a.onDisk && a.usd === a.billed && a.calls >= 1,
    'B-a85f: two billed calls whose counter NEVER reached the disk (a stop first) — the next boot\'s counter holds the journal\'s sum for today (never 0)', a);
  const deSrc = fs.readFileSync(path.join(REPO, 'src/server/decision-engine.js'), 'utf8');
  const A = '    const j = M.daySpendByUse(rows, day0, tzOffset);';   // B-f276 family: the boot's raise is its own step now (rebuildFromJournal), the same line
  const DEno = mutantCopies('decision-budget-a85f', REPO).load('src/server/decision-engine.js', anchored(deSrc, A, '    const j = { byUse: {} };   // MUTANT: the journal is never read at boot', 'the boot reads the journal'), 'no-rebuild');
  const ax = await scene(DEno, 'a85f-rebuild-red');
  ok(ax.billed > 0 && ax.usd === 0, 'CONTROL (a copy that never reads the journal at boot): the day restarts at 0 USD while the journal says money was spent — red', ax);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
