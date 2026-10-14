#!/usr/bin/env node
// decision-probe — THE D1 PROBE (lane decision-core, docs/design-decision-api.zh.md §4 D1 / §2.10). Run by hand with the
// owner's key — NEVER in CI, never from a lane: it makes REAL paid calls (≈ 30 calls, ≈ 60 K input tokens ≈ $0.006).
//   node scripts/decision-probe.mjs            (DATA dir = $VIBESPACE_DATA_DIR or <checkout>/data; presets = the server's)
// THE KEY is read ONLY at run time the way the server reads it — the registry store over data/ + the cluster presets
// directory + the cluster env (resolveIntegration('llm'): the user's own > the cluster preset) — never from
// argv, never printed (a 6-character fingerprint only). Step 1: ONE minimal predicate to each candidate model on the
// row's dialect — who answers 200, usage, cost, latency. Step 2: over 20 fixture records, batch-of-5 (4 calls) vs single
// (20 calls) with the rubric v1 — input tokens per record and the needs_now agreement — the table for §2.10. Pin the
// winner into src/decision-model.js DEFAULT_MODEL ("pinned by probe on <date>").
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = require(path.join(repo, 'src/decision-model.js'));
const S = require(path.join(repo, 'src/server/integration-store.js'));
const CP = require(path.join(repo, 'src/server/cluster-presets.js'));
const quiet = { log() {}, warn() {}, error() {} };

const CANDIDATES = { openrouter: ['typesafe/jev-router', 'openai/gpt-6-luna', 'openai/gpt-6-luna-decisions'], openai: ['gpt-6-luna'] };
const FIXTURES = [
  ...M.GOLDEN.map((g) => g.text),
  'Can you send me the slides before tomorrow\'s 9am review?', 'Lunch is on the 3rd floor today.', 'Your invoice #8812 for $4,200 is overdue by 14 days.',
  '下周一前请确认合同条款，法务在等你。', '本周五团建，自愿参加。', 'Build #2231 passed on main.', 'Hey, quick question — are we still on for Thursday?',
  'Security alert: a new sign-in to your account from Berlin.', 'Reminder: timesheets are due Friday.', 'The customer escalated again: they want a call with you today.',
  'Newsletter: ten tips for better sleep.', 'Can you approve Maria\'s PTO request for next week?', '服务器 CPU 告警已恢复。', 'Thanks, that worked!',
  'I\'m blocked until you merge the migration PR.', 'Weekly digest: 12 new posts in #random.',
].slice(0, 20);

function keyed() {
  const reader = CP.create({ dir: CP.resolveDir(process.env, { useDefault: true }), log: quiet });
  try { reader.start && reader.start(); } catch { }
  const dataDir = process.env.VIBESPACE_DATA_DIR || path.join(repo, 'data');
  const store = S.create({ dataDir, env: process.env, presets: reader, log: quiet });
  const r = store.resolveIntegration('llm');
  try { reader.stop && reader.stop(); } catch { }
  const v = r.values || {};
  // the judging model the engine would use: the LLM plugin's judgeModel row, else the cluster preset's while its key is in use
  let judgeModel = '';
  try { judgeModel = String(JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'))['plugin.llm.judgeModel'] || '').trim(); } catch { }
  return { provider: M.dialectOf(String(v.provider || '').trim().toLowerCase()), key: v.apiKey ? String(v.apiKey) : '', model: judgeModel || (r.source === 'cluster' ? String(v.model || '').trim() : ''), source: r.source };
}

async function call(provider, key, model, input, questions) {
  const t0 = Date.now();
  let status = 0, body = null;
  try {
    const res = await fetch(M.urlOf(provider), { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(M.buildRequest(provider, { model, input, questions })) });
    status = res.status;
    try { body = await res.json(); } catch { }
  } catch { status = 0; }
  const ms = Date.now() - t0;
  return { status, ms, body, usage: M.usageOf(provider, body || {}), answers: body ? M.normalizeAnswers(provider, body, questions) : [] };
}

const k = keyed();
if (!k.provider || !k.key) { console.log(`no llm key resolves here (source: ${k.source}) — save a provider + key on the Language model card (or the cluster preset) and run again`); process.exit(2); }
console.log(`llm: provider ${k.provider} · source ${k.source} · key fingerprint ${crypto.createHash('sha256').update(k.key).digest('hex').slice(0, 6)} · judging model ${k.model || '(empty)'}`);
for (const other of M.PROVIDERS.filter((p) => p !== k.provider)) console.log(`  (${other}: no key on this row — its candidates are skipped)`);

console.log('\nSTEP 1 — one minimal predicate per candidate');
const ONE = [{ type: 'predicate', name: 'deadline_or_money', instructions: 'Does the text mention a deadline or money the reader owes?' }];
const rows = [];
for (const model of CANDIDATES[k.provider]) {
  const r = await call(k.provider, k.key, model, 'The invoice for the March order is due tomorrow.', ONE);
  const a = r.answers[0];
  rows.push({ model, status: r.status, ms: r.ms, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, cost: r.usage.costUsd, answer: a ? (a.refused ? `refused (${a.why})` : `p=${a.probability}`) : '—' });
}
console.table(rows);
const winner = rows.find((r) => r.status === 200 && /^p=/.test(r.answer));
if (!winner) { console.log('no candidate answered 200 with a probability — nothing to pin; step 2 skipped'); process.exit(1); }
console.log(`→ pin DEFAULT_MODEL.${k.provider} = '${winner.model}' (first candidate that answered)`);

console.log(`\nSTEP 2 — batch-of-5 vs single over ${FIXTURES.length} fixture records (rubric v${M.RUBRIC.version}, model ${winner.model})`);
const Q = M.rubricQuestions();
const fixed = { rubric: M.rubricText() };
const single = [], batched = [];
let singleTok = 0, batchTok = 0;
for (const text of FIXTURES) {
  const inp = M.buildInput('attention', { ...fixed, records: [{ body: text }] });
  const r = await call(k.provider, k.key, winner.model, inp.text, Q);
  singleTok += r.usage.inputTokens;
  single.push(M.attentionVerdict(r.answers).p);
}
for (let i = 0; i < FIXTURES.length; i += 5) {
  const recs = FIXTURES.slice(i, i + 5).map((body) => ({ body }));
  const inp = M.buildInput('attention', { ...fixed, records: recs }, { batch: 5 });   // the measurement's own override (the plan says 1)
  const r = await call(k.provider, k.key, winner.model, inp.text, M.batchQuestions(Q, recs.length));
  batchTok += r.usage.inputTokens;
  for (const a of M.unbatchAnswers(r.answers, recs.length)) batched.push(M.attentionVerdict(a).p);
}
const both = single.map((p, i) => [p, batched[i]]).filter(([a, b]) => a !== null && b !== null);
const agree = both.filter(([a, b]) => (a >= M.THRESHOLD_DEFAULT) === (b >= M.THRESHOLD_DEFAULT)).length;
const mad = both.length ? both.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / both.length : null;
console.table([
  { mode: 'single (1 record / call)', calls: FIXTURES.length, inputTokens: singleTok, perRecord: Math.round(singleTok / FIXTURES.length) },
  { mode: 'batch (5 records / call)', calls: Math.ceil(FIXTURES.length / 5), inputTokens: batchTok, perRecord: Math.round(batchTok / FIXTURES.length) },
]);
console.log(`needs_now agreement at ${M.THRESHOLD_DEFAULT}: ${agree}/${both.length}${mad === null ? '' : ` · mean |Δp| ${mad.toFixed(3)}`} · saving ${singleTok ? Math.round((1 - batchTok / singleTok) * 100) : 0}% of input tokens`);
console.log('→ §2.10: keep batch 5 for the attention scan only if the agreement holds (design: else the use falls back to single).');
