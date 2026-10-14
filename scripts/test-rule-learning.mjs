#!/usr/bin/env node
// test-rule-learning — FAST (lane rule-learning, design q-037 P0: the 「我关心什么」 block DRAFTED by a text model from the
// owner's verdicts, proposed never written). PURE src/rule-learning.js + its seams in src/decision-model.js, in-process,
// ZERO vendor calls:
//   ① availability — the truth table provider × key × plugin: the drafter exists ONLY on OpenRouter + a key + the plugin on
//     (+ lane llm-plugin-rename: AND its own switch `learn`, ON by default — off ⇒ `learn-off`); ⑬b the route names the
//     switch / the provider in its 404;
//   ② the tiers + learnCost (Flash default, Sonnet the quality tier — OpenRouter ids, never an Anthropic endpoint);
//   ③ THE INPUT: fixed first (the task), variable last (the block numbered, then the examples: own first, inferred
//     marked), ≤ 60 examples, ≤ 4 000 tokens by estTokens with a 70-example fixture (the inferred ones leave first, then
//     the oldest own) — the measurement printed — + a RED control (the bound loop out ⇒ over 4 000);
//   ④ the strict schema;  ⑤ THE NORMALIZER'S SIX RULES, each with a RED control (a patched copy without the rule);
//   ⑥ diffTable's kinds + blockFrom;  ⑦ weeklySummary (P1 words; no timer);
//   ⑧ PRIVACY (invariant E): a census over buildLearnInput's sources and learnDraft's — only the examples' digests + the
//     block, never a body — with RED controls; a body planted on an example never reaches the input;
//   ⑨ the decision model's seams: budgetVerdict's use cap (`use-budget`, inside the daily budget), examplesForInput's
//     clauses, the readout's `learn` word.
// lane rule-learning-fix (verify r1: F2 blocker, F3, F1, L1–L6) — each finding RED first (a control that brings the old
// shape back), then green; loopback fakes only (ZERO vendor calls), ≈ 2 s in all:
//   ⑩ SAVE NEVER LOSES A LINE: §S2 (a 152-char line kept verbatim ⇒ a ticked 原样保留 row, saved whole), a keep IS the
//     person's line whatever the model wrote, an unsupported edit never claims its line, a one-line block survives every
//     answer shape but a named removal; §S (11 kept + 12 new ⇒ nothing cut, blockFit over) — RED: the old normalizer,
//     the old claim, the old 1 500 slice;
//   ⑪ THE WIRE (F1 / L2): the REAL engine + text client over a loopback fake OpenRouter — 19 answers + a hang ⇒ each ONE
//     request with `provider` deep-equal to the routing literal ON THE WIRE, the named why, the hold gone; a 3xx is
//     `redirect` and nothing reaches the other origin — RED: verify r1's M3 / M2 / M8b and a following client as copies;
//   ⑫ the judge's 3xx (L2): `redirect`, one request, $0 — RED: the judge without redirect: 'error' follows it;
//   ⑬ ONE DRAFT AT A TIME (L4): the REAL router — two POSTs at once ⇒ 200 + 409 `busy`, one request — RED: no gate ⇒ 2;
//   ⑭ EVERY REFUSAL HAS WORDS (L5): the route's whys derived from their sources (the client's budget call swept) ⊆ the
//     card's map — RED: a planted why, a reachable account-never; the registry row's two consumers + endpoints (L6);
//   ⑮ THE CARD over a fake DOM (zh): the long kept line whole, the 1 500 notice + 保存 waiting, 「保存后这一段为空」 /
//     「清空并保存」, a refused door keeps the card, refusals in words, a 500 only under ONE closed 技术细节 fold.
// lane rule-learning-fix-r2 (verify r2: F1 medium, F4 medium, F5 / F6 low, the G7 note) — each RED first, then green:
//   ⑩b THE CUT (F4): an edit / a new line over 120 characters is cut at a word boundary (CJK: at the character; code
//     points) with NO marker, `long`, never pre-ticked, its whole text kept for the fold — verify r2's §F2-e (a 152-char
//     keep + a 170-char edit ⇒ the keep ticked verbatim, the edit unticked, Save writes the person's lines); the schema's
//     maxLength — RED: the old cut (cleanPart's marker, pre-ticked); THE STORED BLOCK (F6): the table on the WHOLE block
//     (1 768 stored ⇒ every line a row, `stored.over`, the Save over and said), the model shown the judge's read only —
//     RED: the old userBlockOf slice drops the tail unsaid;
//   ⑪b THE WIRE SWEEP (F1): every status 300–599 + a reset / a non-JSON body / no choices / five 3xx redirects + a hang,
//     on BOTH tiers through the REAL engine's client — each ONE request to OpenRouter, `provider` deep-equal to the
//     routing, the tier's model — RED: verify r2's N3 / N2b / N2c, a 3xx retry and a Sonnet-only serialized downgrade,
//     each on a copy whose freeze is taken out (the sweep alone catches them); the freeze fails CLOSED on its own (N2b on
//     the frozen client throws, nothing is sent); ⑪c learnDraft over the real engine on a block stored over 1 500 (F6);
//   ⑮ (+) the card: the cut row's 「太长——已截短」 + its own closed fold (F4), ONE header per kind (F5 — RED: the old
//     single header), the stored-block line (F6), ticking an unproven rewording unticks its line and says so (G7).
// lane learn-card-untick (verify r3: R3-F1 medium + four lows here; R3-F3 / R3-F4 in test-vendor-whitelist) — RED first:
//   ⑩c ONE RULE FOR EVERY REWORDING (R3-F1): a pre-ticked rewording's line keeps a row (`replaced`, unticked) — unticked,
//     the rewording gives the line back — RED: the old claim (a ticked row claimed its line);
//   ⑪ / ⑪b (+) a HALF BODY (R3-F2): a 200 whose body stops mid-JSON ⇒ one request, `bad-answer` — RED: verify r3's S5,
//     a retry through the ONE call site in a loop on that half body;
//   ⑮ (+) the card: unticking a pre-ticked rewording keeps the person's line, both rows saying so in both states (R3-F1 —
//     RED: the old table); the stored-block notice follows the count, never «over» beside an enabled 保存 (R3-F5 — RED:
//     the drawn-once notice); the person's own untick of a line outlives its rewording's ticks (R3-F6 — RED: the flip).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import http from 'node:http';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RL = require(path.join(repo, 'src/rule-learning.js'));
const M = require(path.join(repo, 'src/decision-model.js'));
const SRC = fs.readFileSync(path.join(repo, 'src/rule-learning.js'), 'utf8');
const MC = mutantCopies('rulelearn', repo);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mutant = (needle, to, tag) => { if (!SRC.includes(needle)) throw new Error(`mutant needle missing (${tag}): ${needle}`); return MC.load('src/rule-learning.js', SRC.replace(needle, () => to), tag); };
// token shapes built at runtime (never a literal — the secret scan reads the tree)
const TOK = { gh: ['gh', 'p_', 'QRSTUVWXYZ0123456789ABCDEFGHIJKLMNOP'].join(''), ant: ['sk', '-ant-api03-', 'Zy9Xw8Vu7Ts6Rq5Po4Nm3Lk2Jh1Gf0_', 'c'.repeat(20)].join('') };
const row = (provider, apiKey) => ({ values: { provider, apiKey, model: '' }, source: 'user' });

console.log('① availability — exists only on OpenRouter + a key + the plugin on');
{
  const KEY = ['sk-or-v1-', 'f'.repeat(40)].join('');
  const cases = [];
  for (const provider of ['openrouter', 'OpenRouter ', 'openai', '']) for (const key of [KEY, '']) for (const pluginOn of [true, false]) {
    const a = RL.availability({ integrationRow: row(provider, key), pluginOn });
    cases.push([provider.trim().toLowerCase() || '-', key ? 'key' : 'none', pluginOn ? 'on' : 'off', a.exists, a.why]);
  }
  const yes = cases.filter((c) => c[3]);
  ok(yes.length === 2 && yes.every((c) => c[0] === 'openrouter' && c[1] === 'key' && c[2] === 'on'), 'of 16 rows, ONLY openrouter + a key + the plugin on EXIST (the trimmed / cased provider counts)', cases);
  ok(cases.filter((c) => c[0] === 'openai').every((c) => !c[3] && c[4] === 'not-openrouter') && cases.filter((c) => c[0] === 'openrouter' && c[1] === 'none').every((c) => c[4] === 'no-key')
    && cases.filter((c) => c[0] === 'openrouter' && c[1] === 'key' && c[2] === 'off').every((c) => c[4] === 'plugin-off') && cases.filter((c) => c[0] === '-').every((c) => c[4] === 'no-key'), 'each absence is named: not-openrouter · no-key · plugin-off');
  const orRow = row('openrouter', KEY);
  ok(RL.availability({ integrationRow: orRow, pluginOn: true, learnOn: false }).why === 'learn-off' && !RL.availability({ integrationRow: orRow, pluginOn: true, learnOn: false }).exists
    && RL.availability({ integrationRow: orRow, pluginOn: true }).exists && RL.availability({ integrationRow: orRow, pluginOn: false, learnOn: false }).why === 'plugin-off'
    && RL.availability({ integrationRow: row('openai', KEY), pluginOn: true, learnOn: false }).why === 'not-openrouter', 'lane llm-plugin-rename: the drafter\'s own switch — off ⇒ `learn-off` (named after the provider, the key and the plugin); absent ⇒ on (its default)');
  ok(!RL.availability({}).exists && !RL.availability({ integrationRow: { values: null } }).exists && RL.availability({ integrationRow: { values: { provider: 'openrouter', apiKey: KEY }, source: 'cluster' } }).source === 'cluster', 'no row ⇒ absent; a cluster preset counts (its source said)');
}

console.log('② the tiers + learnCost');
{
  ok(RL.MODELS.flash.id === 'google/gemini-3.8-flash' && RL.MODELS.sonnet.id === 'anthropic/claude-sonnet-5.5' && RL.DEFAULT_TIER === 'flash' && RL.modelOf(undefined).key === 'flash' && RL.modelOf('sonnet').key === 'sonnet' && RL.modelOf('anthropic/claude-sonnet-5.5').key === 'sonnet' && RL.modelOf('bogus').key === 'flash', 'two OpenRouter tiers, Flash the default (an unknown setting falls back to it)');
  ok(RL.learnCost('flash', 4000, 1000) === 0.00675 && RL.learnCost('sonnet', 4000, 1000) === 0.018 && RL.learnCost('flash', -5, 'x') === 0, 'a full call ≈ $0.007 on Flash, ≈ $0.018 on Sonnet (the design\'s figures); junk counts 0', [RL.learnCost('flash', 4000, 1000), RL.learnCost('sonnet', 4000, 1000)]);
  ok(Object.values(RL.MODELS).every((m) => !/api\.anthropic|claude\.ai\//.test(JSON.stringify(m))), 'no tier names an Anthropic endpoint (the quality tier rides OpenRouter, billed per token)');
}

{
  const proto = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];
  ok(proto.every((v) => RL.modelOf(v) === RL.MODELS.flash) && RL.modelOf('sonnet') === RL.MODELS.sonnet && RL.modelOf('anthropic/claude-sonnet-5.5') === RL.MODELS.sonnet, 'L1 (lane rule-learning-fix): a prototype key (constructor / toString / __proto__ / hasOwnProperty / valueOf) is no tier ⇒ the Flash default, never a body without a model', proto.map((v) => RL.modelOf(v) && RL.modelOf(v).key));
  const m = mutant("(typeof v === 'string' && Object.hasOwn(MODELS, v) ? MODELS[v] : null)", 'MODELS[v]', 'l1');
  ok(typeof m.modelOf('constructor').id !== 'string', 'RED CONTROL (L1): MODELS[v] without the own-key check answers Object for "constructor" — a request body with no model id', typeof m.modelOf('constructor').id);
}

console.log('③ THE INPUT — fixed first, variable last; ≤ 60 examples; ≤ 4 000 tokens');
const BLOCK = 'Invoices and contracts matter to me.\nAnything my manager asks.\n\nNot newsletters.';
{
  const ex = [{ snippet: 'Invoice 7 — can you approve it today?', verdict: 'needs', clauses: ['asks_me', 'deadline_money'] }, { snippet: 'Weekly digest of the forum', verdict: 'not', clauses: [] }, { snippet: 'Lunch poll', verdict: 'not', inferred: true }];
  const inp = RL.buildLearnInput({ block: BLOCK, examples: ex, rubricHits: ex.map((x) => x.clauses) });
  const [sys, user] = inp.messages;
  ok(sys.role === 'system' && sys.content === RL.TASK && user.role === 'user', 'two messages: the FIXED task first (system), the variable part last (user)');
  const u = user.content;
  ok(u.indexOf('[block] 3 lines') === 0 && u.indexOf('1. Invoices and contracts') < u.indexOf('2. Anything my manager') && u.indexOf('3. Not newsletters') < u.indexOf('[examples]'), 'the variable part: the block numbered line by line (the empty line skipped) BEFORE the examples', u.slice(0, 200));
  ok(/#1 needs · Invoice 7 — can you approve it today\? · the judge saw: asks you, deadline or money/.test(u) && /#2 not · Weekly digest/.test(u) && /#3 not \(inferred\) · Lunch poll/.test(u), 'each example: its number, the verdict, `inferred` for an implicit one, the digest, the clause words the judge had named (OUR words)', u);
  ok(eq(inp.examples.map((x) => [x.n, x.verdict, x.inferred]), [[1, 'needs', false], [2, 'not', false], [3, 'not', true]]) && eq(inp.lines, ['Invoices and contracts matter to me.', 'Anything my manager asks.', 'Not newsletters.']) && inp.est === M.estTokens(sys.content) + M.estTokens(JSON.stringify(RL.LEARN_SCHEMA)) + 16 + M.estTokens(u), 'the examples AS SENT (the numbers `from` refers to) and the est = task + schema + framing + the variable part');
  const empty = RL.buildLearnInput({ block: '', examples: ex });
  ok(/^\[block\] 0 lines\n\(empty\)/.test(empty.messages[1].content), 'an empty block says (empty)');
  const leak = RL.buildLearnInput({ block: `My key is ${TOK.gh}`, examples: [{ snippet: `token ${TOK.ant} · mail a.person@example.com`, verdict: 'needs' }] }).messages[1].content;
  ok(!leak.includes(TOK.gh) && !leak.includes(TOK.ant) && !leak.includes('a.person@') && leak.includes('…@example.com'), 'the block and every digest pass the ONE scrub again (a secret redacted, an address cut to its domain)', leak);

  // the 70-example fixtures (SHAPES, no names): short ASCII ⇒ the 60 cap; long CJK ⇒ the 4 000-token bound
  const short = Array.from({ length: 70 }, (_, i) => ({ snippet: `Order ${i} status — the shipment for line ${i} is ready`, verdict: i % 3 ? 'not' : 'needs', ...(i >= 40 ? { inferred: true } : {}) }));
  const s = RL.buildLearnInput({ block: BLOCK, examples: short });
  ok(s.examples.length === 60 && s.counts.own === 40 && s.counts.inferred === 20 && s.est <= RL.LEARN.inputMax && s.dropped.inferred === 0 && s.dropped.own === 0, `70 short examples ⇒ the 60 cap (all 40 own + the newest 20 inferred), ${s.est} tokens ≤ 4 000, none trimmed`, { n: s.examples.length, est: s.est, c: s.counts });
  const cjk = (i) => `第${i}号订单的付款通知：` + '请在本周五之前确认这一笔款项并回复财务部门的同事，否则流程会被延后'.repeat(6);
  const long = Array.from({ length: 70 }, (_, i) => ({ snippet: cjk(i), verdict: i % 2 ? 'needs' : 'not', ...(i >= 30 ? { inferred: true } : {}) }));
  const l = RL.buildLearnInput({ block: BLOCK, examples: long });
  const ownNs = l.examples.filter((x) => !x.inferred).length;
  ok(l.est <= RL.LEARN.inputMax && l.counts.inferred === 0 && l.dropped.inferred === 30 && l.dropped.own > 0 && ownNs + l.dropped.own === 30, `70 long CJK examples (200 chars ≈ 200 tokens each) ⇒ ${l.est} tokens ≤ 4 000: the 30 inferred left FIRST, then the ${l.dropped.own} oldest own; ${ownNs} own kept`, { est: l.est, dropped: l.dropped, c: l.counts });
  const keptFirst = l.messages[1].content.split('\n').find((x) => x.startsWith('#1 '));
  ok(keptFirst && keptFirst.includes(`第${l.dropped.own}号`) && l.examples.every((x, i) => x.n === i + 1), 'the OLDEST own ones left (the first kept is #' + l.dropped.own + ' of the list) and the numbers stay contiguous', keptFirst && keptFirst.slice(0, 40));
  console.log(`    measured: short 70 → ${s.examples.length} sent, ${s.est} tokens · long CJK 70 → ${l.examples.length} sent, ${l.est} tokens (dropped ${l.dropped.inferred} inferred + ${l.dropped.own} own)`);
  const unbound = mutant('  while (est > LEARN.inputMax && list.length) {', '  while (false) {', 'nobound');
  const ul = unbound.buildLearnInput({ block: BLOCK, examples: long });
  ok(ul.est > RL.LEARN.inputMax && ul.examples.length === 60, `RED CONTROL: the bound loop taken out ⇒ the same fixture sends ${ul.est} tokens (> 4 000)`, ul.est);
}

console.log('④ the strict schema');
{
  const S = RL.LEARN_SCHEMA;
  const objs = [S, S.properties.lines.items, S.properties.removed.items];
  ok(objs.every((o) => o.type === 'object' && o.additionalProperties === false && eq([...o.required].sort(), Object.keys(o.properties).sort())), 'strict: every object closed (additionalProperties false) with EVERY property required (the strict-mode rule)');
  ok(eq(S.properties.lines.items.properties.kind.enum, ['keep', 'edit', 'add']) && eq(S.properties.lines.items.properties.line.type, ['integer', 'null']) && S.properties.lines.items.properties.from.items.type === 'integer' && S.properties.note.type === 'string', 'lines[]: text · kind keep|edit|add · line (null for add) · from [example #] · evidence; removed[]: line + reason; note');
  ok(eq(JSON.parse(JSON.stringify(S)), S), 'the schema is plain JSON (it rides response_format as is)');
}

console.log('⑤ THE NORMALIZER — six rules, each with a RED control');
const EX3 = [{ n: 1 }, { n: 2 }, { n: 3 }];
const B3 = 'Invoices and contracts matter to me.\nAnything my manager asks.\nNot newsletters.';
{
  const many = { lines: Array.from({ length: 15 }, (_, i) => ({ text: `Criterion ${i}`, kind: 'add', line: null, from: [1], evidence: 'e' })), removed: [], note: '' };
  const r1 = RL.normalizeProposal(many, { block: B3, examples: EX3 });
  const m1 = mutant('    if (lines.length >= LEARN.linesMax) break;', '', 'r1').normalizeProposal(many, { block: B3, examples: EX3 });
  ok(r1.ok && r1.lines.length === 12 && r1.lines[11].text === 'Criterion 11', '① at most 12 lines (15 answered ⇒ the first 12)', r1.lines.length);
  ok(m1.lines.length === 15, 'RED CONTROL ①: without the cap all 15 pass', m1.lines.length);

  const dirty = { lines: [{ text: `Mail from a.person@example.com about ${TOK.gh}`, kind: 'add', line: null, from: [1], evidence: `seen with ${TOK.ant}` }], removed: [{ line: 3, reason: `because ${TOK.gh}` }], note: `note ${TOK.ant}` };
  const r2 = RL.normalizeProposal(JSON.stringify(dirty), { block: B3, examples: EX3 });
  const all2 = JSON.stringify(r2);
  ok(r2.ok && !all2.includes(TOK.gh) && !all2.includes(TOK.ant) && !all2.includes('a.person@') && all2.includes('…@example.com'), '② every string the model wrote (text, evidence, reason, note) passes the ONE scrub — secrets redacted, addresses cut', all2);
  const m2 = mutant("const clean = (s, max) => (typeof s === 'string' ? M.cleanPart(s, max, 'line').replace(/\\s+/g, ' ').trim().slice(0, max) : '');", "const clean = (s, max) => (typeof s === 'string' ? s : '');", 'r2').normalizeProposal(dirty, { block: B3, examples: EX3 });
  ok(JSON.stringify(m2).includes(TOK.gh), 'RED CONTROL ②: clean = identity ⇒ the token reaches the card');
  const longText = RL.normalizeProposal({ lines: [{ text: 'x'.repeat(500), kind: 'add', line: null, from: [1], evidence: 'y'.repeat(500) }], removed: [], note: 'z'.repeat(900) }, { block: B3, examples: EX3 });
  ok(longText.lines[0].text.length <= 120 && longText.lines[0].evidence.length <= 120 && longText.note.length <= 300, '② …and bounded (text / evidence ≤ 120, note ≤ 300)', [longText.lines[0].text.length, longText.note.length]);

  const refs = { lines: [{ text: 'Payments due this week', kind: 'add', line: null, from: [0, 2, 99, 2, 'x', 1.5, -1], evidence: 'e' }], removed: [], note: '' };
  const r3 = RL.normalizeProposal(refs, { block: B3, examples: EX3 });
  ok(eq(r3.lines[0].from, [2]) && !r3.lines[0].unsupported, '③ example numbers outside the input (0, 99, -1, junk, a fraction) are dropped; a duplicate counted once ⇒ [2]', r3.lines[0].from);
  const m3 = mutant('.filter((i) => Number.isInteger(i) && i >= 1 && i <= n)', '.filter(() => true)', 'r3').normalizeProposal(refs, { block: B3, examples: EX3 });
  ok(m3.lines[0].from.includes(99), 'RED CONTROL ③: without the range check #99 (an example nobody sent) is cited', m3.lines[0].from);

  const bare = { lines: [{ text: 'Anything from the board', kind: 'add', line: null, from: [], evidence: 'a hunch' }, { text: 'Invoices and contracts matter to me.', kind: 'keep', line: 1, from: [], evidence: '' }, { text: 'Anything my manager asks, today', kind: 'edit', line: 2, from: [42], evidence: '' }], removed: [], note: '' };
  const r4 = RL.normalizeProposal(bare, { block: B3, examples: EX3 });
  const t4 = RL.diffTable(B3, r4);
  ok(r4.lines[0].unsupported && !r4.lines[1].unsupported && r4.lines[2].unsupported && t4.rows[0].tick === false && t4.rows[1].tick === true && t4.rows[2].tick === false, '④ a new line and an edit with no valid example are `unsupported` (shown, NOT ticked); a keep is the person\'s own line (needs no example)', r4.lines.map((x) => [x.kind, x.unsupported]));
  const m4 = mutant("unsupported: kind !== 'keep' && !from.length,", 'unsupported: false,', 'r4');
  const mt4 = m4.diffTable(B3, m4.normalizeProposal(bare, { block: B3, examples: EX3 }));
  ok(mt4.rows[0].tick === true && !mt4.rows[0].unsupported, 'RED CONTROL ④: without the mark an invented line is pre-ticked (it would be saved unread)', mt4.rows[0]);

  const dup = { lines: [{ text: 'Invoices', kind: 'add', line: null, from: [1], evidence: '' }, { text: '  invoices ', kind: 'add', line: null, from: [2], evidence: '' }, { text: '   ', kind: 'add', line: null, from: [1], evidence: '' }, { text: 'Contracts', kind: 'add', line: null, from: [1], evidence: '' }], removed: [], note: '' };
  const r5 = RL.normalizeProposal(dup, { block: B3, examples: EX3 });
  ok(eq(r5.lines.map((x) => x.text), ['Invoices', 'Contracts']), '⑤ an empty line and a duplicate (case / space folded) are dropped', r5.lines.map((x) => x.text));
  const m5 = mutant('    if (!text || seen.has(fold(text))) continue;', '    if (!text) continue;', 'r5').normalizeProposal(dup, { block: B3, examples: EX3 });
  ok(m5.lines.length === 3, 'RED CONTROL ⑤: without the fold the duplicate stays', m5.lines.map((x) => x.text));

  const lines6 = { lines: [{ text: 'Invoices and contracts matter to me.', kind: 'keep', line: 1, from: [1], evidence: '' }, { text: 'Board decisions', kind: 'edit', line: 7, from: [1], evidence: '' }, { text: 'Manager asks — today', kind: 'edit', line: 1, from: [2], evidence: '' }], removed: [{ line: 9, reason: 'gone' }, { line: 1, reason: 'kept elsewhere' }, { line: 3, reason: 'never needed you' }, { line: 3, reason: 'again' }], note: '' };
  const r6 = RL.normalizeProposal(lines6, { block: B3, examples: EX3 });
  ok(eq(r6.lines.map((x) => [x.kind, x.line]), [['keep', 1], ['add', null], ['add', null]]) && eq(r6.removed, [{ line: 3, reason: 'never needed you' }]), '⑥ a keep / an edit / a removal names an EXISTING block line, each claimed once: line 7 ⇒ a new line, a 2nd claim of line 1 ⇒ a new line, removals of 9 / of the kept 1 / a 2nd of 3 dropped', [r6.lines.map((x) => [x.kind, x.line]), r6.removed]);
  const m6 = mutant('    if (!r || !Number.isInteger(r.line) || r.line < 1 || r.line > nl || claimed.has(r.line) || removed.some((x) => x.line === r.line)) continue;', '    if (!r) continue;', 'r6').normalizeProposal(lines6, { block: B3, examples: EX3 });
  ok(m6.removed.some((x) => x.line === 9) && m6.removed.some((x) => x.line === 1), 'RED CONTROL ⑥: without the check a removal of a line that does not exist (9) and of the kept line 1 stand', m6.removed);
  const m6b = mutant('    let line = Number.isInteger(x.line) && x.line >= 1 && x.line <= nl && !claimed.has(x.line) ? x.line : null;', '    let line = Number.isInteger(x.line) ? x.line : null;', 'r6b').normalizeProposal(lines6, { block: B3, examples: EX3 });
  ok(m6b.lines.some((x) => x.line === 7), 'RED CONTROL ⑥b: without it an "edit" of block line 7 (of 3) stands', m6b.lines.map((x) => [x.kind, x.line]));

  const reworded = RL.normalizeProposal({ lines: [{ text: 'Anything my manager asks.', kind: 'edit', line: 2, from: [], evidence: '' }, { text: 'Not newsletters or digests', kind: 'keep', line: 3, from: [2], evidence: '' }], removed: [], note: '' }, { block: B3, examples: EX3 });
  ok(eq(reworded.lines.map((x) => [x.kind, x.text]), [['keep', 'Anything my manager asks.'], ['keep', 'Not newsletters.']]), 'an "edit" that changes nothing is a keep (the person\'s own words, as written); a "keep" of a valid line IS that line, verbatim, whatever the model wrote (lane rule-learning-fix F2)');
  ok(!RL.normalizeProposal('not json', {}).ok && RL.normalizeProposal('not json', {}).why === 'bad-answer' && !RL.normalizeProposal({ lines: 'x' }).ok && RL.normalizeProposal('```json\n{"lines":[],"removed":[],"note":""}\n```', {}).ok, 'an answer that is no JSON object (or has no lines[]) ⇒ `bad-answer`; a fenced JSON answer is read');
}

console.log('⑥ diffTable + blockFrom');
{
  const p = RL.normalizeProposal({ lines: [{ text: 'Invoices and contracts matter to me.', kind: 'keep', line: 1, from: [], evidence: '' }, { text: 'Anything my manager asks, the same day', kind: 'edit', line: 2, from: [1, 2], evidence: 'two of them waited a day' }, { text: 'Outages of the checkout', kind: 'add', line: null, from: [3], evidence: 'an incident needed you' }, { text: 'Anything from the board', kind: 'add', line: null, from: [], evidence: '' }], removed: [{ line: 3, reason: 'two newsletters needed you' }], note: 'Small changes.' }, { block: B3 + '\nTravel bookings.', examples: EX3 });
  const t = RL.diffTable(B3 + '\nTravel bookings.', p);
  ok(eq(t.rows.map((r) => r.op), ['keep', 'edit', 'add', 'add']) && t.rows[1].was === 'Anything my manager asks.' && eq(t.rows[1].from, [1, 2]) && eq(t.counts, { keep: 1, edit: 1, add: 2, remove: 1, unmentioned: 1, replaced: 1, unproven: 0, shortened: 0, unsupported: 1, long: 0 }), 'the four kinds — keep · edit (with what it was) · add · remove — and a block line the answer never mentioned', t.counts);
  ok(eq(t.removed.map((r) => [r.op, r.line, r.tick]), [['replaced', 2, false], ['remove', 3, false], ['unmentioned', 4, true]]) && t.removed[1].reason === 'two newsletters needed you', 'the line the (pre-ticked) edit rewords keeps its own row, unticked (`replaced` — lane learn-card-untick R3-F1); a named removal is unticked (it leaves) with its reason; an unmentioned line stays ticked (never lost unseen)', t.removed);
  ok(RL.blockFrom(t) === 'Invoices and contracts matter to me.\nAnything my manager asks, the same day\nOutages of the checkout\nTravel bookings.', 'blockFrom = the ticked lines in order, then the kept ones the answer left out (the unsupported line is not written)', RL.blockFrom(t));
  const edited = { rows: t.rows.map((r, i) => (i === 3 ? { ...r, tick: true, text: 'Board  decisions ' } : r)), removed: t.removed.map((r) => ({ ...r, tick: true })) };
  ok(RL.blockFrom(edited).split('\n').length === 7 && RL.blockFrom(edited).includes('Board  decisions') && RL.blockFrom(edited).includes('Not newsletters.') && RL.blockFrom(edited).includes('Anything my manager asks.'), 'the person\'s ticks and edits are what Save writes (their replaced line ticked again ⇒ kept beside its rewording)');
  const long2k = RL.blockFrom({ rows: [{ text: 'y'.repeat(2000), tick: true }] });
  ok(long2k.length === 2000 && RL.blockFit(long2k).over && RL.blockFit(long2k).chars === 2000 && !RL.blockFit('y'.repeat(M.USER_BLOCK_MAX)).over && RL.diffTable(B3, { ok: false }).rows.length === 0, 'never cut (lane rule-learning-fix F3): blockFrom answers the whole text, blockFit says over 1 500 (1 500 itself fits); a failed proposal draws nothing', RL.blockFit(long2k));
}

console.log('⑦ weeklySummary (P1 words — the trigger is OFF, no timer)');
{
  const ex = [{ verdict: 'needs', at: 10 }, { verdict: 'not', at: 20, source: 'implicit' }, { verdict: 'not', at: 30 }, { verdict: 'needs', at: 40 }, { verdict: 'needs', at: 50, source: 'implicit' }, { verdict: 'bogus', at: 60 }, { verdict: 'not', at: 5 }];
  const w = RL.weeklySummary(ex, 9);
  ok(w.total === 5 && w.own === 3 && w.inferred === 2 && w.due === true && w.text === 'This week: 5 decisions (3 yours, 2 inferred)', 'counts since the last digest (own / inferred), due at ≥ 5, words through t', w);
  ok(RL.weeklySummary(ex, 25).due === false && RL.weeklySummary(ex, 25).total === 3, '4 or fewer new ⇒ not due (no call)');
  const files = ['src/rule-learning.js', 'src/server/text-model-client.js', 'src/server/channels-attention.js', 'src/server/decision-engine.js'].map((f) => fs.readFileSync(path.join(repo, f), 'utf8'));
  ok(!files.some((s) => /weeklySummary\(/.test(s.replace(/^.*function weeklySummary.*$/m, '').replace(/^\s*(\*|\/\/).*$/gm, '').replace(/module\.exports[\s\S]*$/, ''))), 'nothing calls weeklySummary (P1 and OFF — no timer is wired)');
}

console.log('⑧ PRIVACY (invariant E) — the input is only what the judge already saw');
const ATT = fs.readFileSync(path.join(repo, 'src/server/channels-attention.js'), 'utf8');
// a function's whole text: from `function name(` to the brace that closes its BODY (the first `) {` at a line end — a
// destructured parameter list has braces of its own)
const fnSource = (text, name) => {
  const i = text.indexOf(`function ${name}(`); if (i < 0) return '';
  const m = /\)\s*\{[ \t]*\n/.exec(text.slice(i)); if (!m) return text.slice(i);
  let d = 0;
  for (let k = i + m.index + m[0].indexOf('{'); k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}' && --d === 0) return text.slice(i, k + 1); }
  return text.slice(i);
};
const inputCensus = (rlText, attText) => {
  const problems = [];
  const reqs = [...rlText.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  if (!eq(reqs, ['./decision-model.js'])) problems.push(`rule-learning.js requires ${reqs.join(', ')}`);
  const src = fnSource(rlText, 'buildLearnInput') + fnSource(rlText, 'exampleLine');
  const read = [...new Set([...src.matchAll(/\bx\.(\w+)/g)].map((m) => m[1]))].sort();
  const ALLOWED = ['clauses', 'digest', 'hits', 'inferred', 'snippet', 'verdict'];
  for (const k of read) if (!ALLOWED.includes(k)) problems.push(`buildLearnInput reads an example's .${k}`);
  if (/\b(body|tail|lastText|title|text)\b\s*[:(]/.test(src.replace(/content: user|role: 'user'/g, ''))) problems.push('buildLearnInput names a record field (body / tail / title / text)');
  const ld = fnSource(attText, 'learnDraft');
  if (!ld.includes('M.examplesForInput(examples') || !ld.includes('userBlock()')) problems.push('learnDraft does not build from examplesForInput + the block');
  for (const w of ['tailOf', 'attentionRecord', 'viewNow', '.body', 'rowFacts', 'factsFor']) if (ld.includes(w)) problems.push(`learnDraft reads ${w}`);
  return problems;
};
{
  const pr = inputCensus(SRC, ATT);
  ok(fnSource(SRC, 'buildLearnInput').includes('dropped, counts:') && fnSource(ATT, 'learnDraft').includes('RL.diffTable(stored, proposal)'), 'the census reads the WHOLE bodies of buildLearnInput and learnDraft (not their signatures)');
  ok(pr.length === 0, 'CENSUS: rule-learning.js requires only the decision model; buildLearnInput reads only an example\'s snippet / verdict / inferred / clauses; learnDraft builds from M.examplesForInput + the block — no tail, no record, no body', pr);
  const plantedRl = SRC.replace("verdict: x.verdict, inferred: !!x.inferred, digest:", "verdict: x.verdict, inferred: !!x.inferred, body: x.body, digest:");
  const plantedAtt = ATT.replace('    const block = userBlock();\n    const input = RL.buildLearnInput(', '    const block = userBlock() + tailOf(null).map((r) => r.text).join();\n    const input = RL.buildLearnInput(');
  ok(plantedRl !== SRC && inputCensus(plantedRl, ATT).some((p) => /\.body/.test(p)) && plantedAtt !== ATT && inputCensus(SRC, plantedAtt).some((p) => /tailOf/.test(p)), 'RED CONTROLS: a body read in buildLearnInput, a tail read in learnDraft — each named', [inputCensus(plantedRl, ATT), inputCensus(SRC, plantedAtt)]);
  const MARK = 'BODY-MARK-' + 'q7';
  const inp = RL.buildLearnInput({ block: 'x', examples: [{ snippet: 'digest only', verdict: 'needs', body: MARK, text: MARK, title: MARK, tail: [MARK] }] });
  ok(!JSON.stringify(inp.messages).includes(MARK) && JSON.stringify(inp.messages).includes('digest only'), 'RUNTIME: an example carrying a body / text / title / tail sends ONLY its digest');
}

console.log('⑨ the decision model\'s seams (use cap · clauses · readout)');
{
  const on = { pluginOn: true, featureOn: true, keyPresent: true, now: 0, ceilingCents: 100 };
  ok(M.WHY.includes('use-budget') && M.budgetVerdict({ ...on, spentUsd: 0.2, estUsd: 0.007, useSpentUsd: 0.095, useCeilingCents: 10 }).why === 'use-budget' && M.budgetVerdict({ ...on, spentUsd: 0.2, estUsd: 0.007, useSpentUsd: 0.09, useCeilingCents: 10 }).ok, 'budgetVerdict: a use\'s own cap (learn: 10 ¢) stops the 0.095 + 0.007 call, passes 0.09 + 0.007');
  ok(M.budgetVerdict({ ...on, spentUsd: 0.999, estUsd: 0.007, useSpentUsd: 0, useCeilingCents: 10 }).why === 'daily-budget' && M.budgetVerdict({ ...on, spentUsd: 0.5, estUsd: 0.007 }).ok && M.budgetVerdict({ ...on, plan: true, useSpentUsd: 9, useCeilingCents: 10 }).why === 'plan', 'the daily budget is asked FIRST (the use cap lives inside it); no cap given ⇒ no effect; the row stops still come before the money');
  const list = [{ key: 'a', snippet: 's1', verdict: 'needs', clauses: ['asks_me'] }, { key: 'b', snippet: 's2', verdict: 'not', clauses: [], source: 'implicit' }];
  ok(eq(M.examplesForInput(list), [{ snippet: 's1', verdict: 'needs' }, { snippet: 's2', verdict: 'not', inferred: true }]) && eq(M.examplesForInput(list, 12, { clauses: true }), [{ snippet: 's1', verdict: 'needs', clauses: ['asks_me'] }, { snippet: 's2', verdict: 'not', inferred: true, clauses: [] }]), 'examplesForInput: the default shape unchanged (the judge\'s memo material), `{clauses: true}` adds the judge\'s clause names');
  const L = M.decisionTodayLine({ byUse: { attention: { calls: 2, usd: 0.001 }, learn: { calls: 1, usd: 0.0068 } } }, 1);
  ok(L.title === 'Needs attention $0.001 · For-you tray $0 · Rules $0 · Block drafts $0.007' && L.calls === 3 && !M.decisionTodayLine({ byUse: {} }, 1).title.includes('Block drafts'), 'the readout names the drafter\'s money (「起草判据」) when it spent — counted in the day like every use', L.title);
  ok(M.JOURNAL_FIELDS.includes('zdr') && M.journalRow({ use: 'learn', zdr: true, model: 'google/gemini-3.8-flash', usd: 0.0068 }).zdr === true, 'the journal line carries zdr: true');
}

console.log('⑩ SAVE NEVER LOSES A LINE (lane rule-learning-fix F2 / F3) — the verifier\'s §S2 / §S on the PURE table, each with a RED control');
const LONG = 'Anything my manager or the finance team sends about invoices, contracts or payments that are due this week, and anything that asks me to approve or sign';
{
  for (const block of [LONG, LONG + '\nForum digests never matter']) {
    const answer = { lines: block.split('\n').map((l, i) => ({ text: l, kind: 'keep', line: i + 1, from: [], evidence: '' })), removed: [], note: '' };
    const t = RL.diffTable(block, RL.normalizeProposal(answer, { block, examples: EX3 }));
    ok(t.rows.every((r) => r.op === 'keep' && r.tick && !r.unsupported) && RL.blockFrom(t) === block, `§S2 a ${LONG.length}-char line kept word for word (a ${block.split('\n').length}-line block) ⇒ a ticked 原样保留 row, 保存 writes the block unchanged`, t.rows.map((r) => [r.op, r.tick, r.text.length]));
  }
  const elided = M.cleanPart(LONG, 120, 'line');
  for (const [name, text] of [['its 120-cut copy with the elision', elided], ['a rewording', 'Manager and finance mail'], ['empty', ''], ['not a string', 42]]) {
    const p = RL.normalizeProposal({ lines: [{ text, kind: 'keep', line: 1, from: [], evidence: '' }], removed: [], note: '' }, { block: LONG, examples: EX3 });
    ok(p.lines.length === 1 && p.lines[0].kind === 'keep' && p.lines[0].text === LONG && !p.lines[0].unsupported && RL.blockFrom(RL.diffTable(LONG, p)) === LONG, `a keep of line 1 whose model text is ${name} ⇒ the person's line, verbatim, saved whole`, p.lines);
  }
  const sameLong = RL.normalizeProposal({ lines: [{ text: LONG, kind: 'edit', line: 1, from: [], evidence: '' }], removed: [], note: '' }, { block: LONG, examples: EX3 });
  ok(sameLong.lines[0].kind === 'keep' && sameLong.lines[0].text === LONG && !sameLong.lines[0].unsupported, 'an "edit" that writes the long line word for word is a keep (both sides compared at lineMax 300, never at the model\'s 120)', sameLong.lines[0]);
  const longEdit = RL.normalizeProposal({ lines: [{ text: LONG + ' — and travel', kind: 'edit', line: 1, from: [1], evidence: 'e' }, { text: 'n'.repeat(200), kind: 'add', line: null, from: [1], evidence: 'e' }], removed: [], note: '' }, { block: LONG, examples: EX3 });
  ok(longEdit.lines.every((l) => l.text.length <= RL.LEARN.textMax), 'the 120 bound still holds for an edit and a new line (the model\'s own words)', longEdit.lines.map((l) => [l.kind, l.text.length]));
  const weak = RL.normalizeProposal({ lines: [{ text: 'Manager mail', kind: 'edit', line: 1, from: [], evidence: 'a guess' }], removed: [], note: '' }, { block: LONG, examples: EX3 });
  const tw = RL.diffTable(LONG, weak);
  ok(tw.rows[0].op === 'edit' && tw.rows[0].unsupported && !tw.rows[0].tick && eq(tw.removed.map((r) => [r.op, r.line, r.tick]), [['unproven', 1, true]]) && RL.blockFrom(tw) === LONG && tw.counts.unproven === 1, 'a demoted row never takes the person\'s line: an edit with no evidence (unticked) leaves its line in the kept list (`unproven`, ticked) — 保存 writes it', { rows: tw.rows, removed: tw.removed });
  const ONE = 'Invoices and contracts matter to me.';
  const shapes = {
    'a keep': [{ text: ONE, kind: 'keep', line: 1, from: [] }],
    'a keep, its text cut': [{ text: ONE.slice(0, 12) + '…', kind: 'keep', line: 1, from: [] }],
    'a keep, reworded': [{ text: 'Contracts', kind: 'keep', line: 1, from: [] }],
    'an edit without evidence': [{ text: 'Contracts only', kind: 'edit', line: 1, from: [] }],
    'an edit of a line that does not exist': [{ text: 'Contracts only', kind: 'edit', line: 9, from: [1] }],
    'only new lines without evidence': [{ text: 'Board mail', kind: 'add', line: null, from: [] }],
    'nothing at all': [],
  };
  const lost = Object.entries(shapes).filter(([, lines]) => !RL.blockFrom(RL.diffTable(ONE, RL.normalizeProposal({ lines, removed: [], note: '' }, { block: ONE, examples: EX3 }))).split('\n').includes(ONE)).map(([k]) => k);
  ok(lost.length === 0, `a ONE-LINE block is never erased by the default 保存 — ${Object.keys(shapes).length} answer shapes (${Object.keys(shapes).join(' · ')})`, lost);
  const named = RL.diffTable(ONE, RL.normalizeProposal({ lines: [], removed: [{ line: 1, reason: 'never needed you' }], note: '' }, { block: ONE, examples: EX3 }));
  ok(RL.blockFrom(named) === '' && RL.blockFit('').empty && RL.blockFit(' \n ').empty && named.removed[0].op === 'remove' && named.removed[0].tick === false, 'only a NAMED removal empties it by default — and blockFit says `empty` (the card then shows 「保存后这一段为空」 and 「清空并保存」)', named.removed);
  const N_NEW = "    else if (kind === 'keep' || fold(clean(x.text, LEARN.lineMax)) === fold(clean(bl[line - 1], LEARN.lineMax))) { kind = 'keep'; text = bl[line - 1]; }";
  const N_OLD = "    else if (fold(text) === fold(clean(bl[line - 1], LEARN.lineMax))) { kind = 'keep'; text = bl[line - 1]; }\n    else if (kind === 'keep') kind = 'edit';";
  const C_NEW = "  const claimed = new Set(rows.filter((r) => r.op === 'keep').map((r) => r.line).filter(Boolean));", C_OLD = '  const claimed = new Set(rows.map((r) => r.line).filter(Boolean));';
  const keepLong = { lines: [{ text: LONG, kind: 'keep', line: 1, from: [], evidence: '' }], removed: [], note: '' };
  const mA = mutant(N_NEW, N_OLD, 'f2a');
  const mtA = mA.diffTable(LONG, mA.normalizeProposal(keepLong, { block: LONG, examples: EX3 }));
  ok(mtA.rows[0].op === 'edit' && mtA.rows[0].unsupported && !mtA.rows[0].tick && mtA.rows[0].text !== LONG && mtA.rows[0].text.length <= RL.LEARN.textMax, 'RED CONTROL (F2, the normalizer): the old one (the 120-cut text compared) demotes the kept line to an unticked 改写 · 无依据 whose box holds a cut copy — the §S2 leg above is red on it', mtA.rows[0]);
  const mB = mutant(C_NEW, C_OLD, 'f2b');
  ok(mB.blockFrom(mB.diffTable(LONG, weak)) === '', 'RED CONTROL (F2, the claim): an unsupported row claiming its line again ⇒ the default 保存 erases the block');
  const mAB = MC.load('src/rule-learning.js', SRC.replace(N_NEW, () => N_OLD).replace(C_NEW, () => C_OLD), 'f2ab');
  ok(mAB.blockFrom(mAB.diffTable(LONG, mAB.normalizeProposal(keepLong, { block: LONG, examples: EX3 }))) === '', 'RED CONTROL (F2, verify r1\'s §S2 exactly — both old shapes): 保存 writes "" for the one-line block (each fix alone already keeps it: two defences)');

  const own = Array.from({ length: 11 }, (_, i) => `rule ${String(i + 1).padStart(2, '0')}: ` + `the person's own words about what matters, line ${i + 1} `.repeat(3).slice(0, 118));
  const BIG = own.join('\n');
  const EX12 = Array.from({ length: 12 }, (_, i) => ({ n: i + 1 }));
  const raw12 = { lines: Array.from({ length: 12 }, (_, i) => ({ text: `new criterion ${i + 1}: ` + 'messages about the quarterly budget review that ask me directly '.slice(0, 92), kind: 'add', line: null, from: [i + 1], evidence: 'seen' })), removed: [], note: '' };
  const tS = RL.diffTable(BIG, RL.normalizeProposal(raw12, { block: BIG, examples: EX12 }));
  const sS = RL.blockFrom(tS), fS = RL.blockFit(sS);
  ok(BIG.length <= M.USER_BLOCK_MAX && own.every((l) => sS.split('\n').includes(l)) && sS.length > M.USER_BLOCK_MAX && fS.over && fS.chars === sS.length && fS.max === M.USER_BLOCK_MAX, `§S an 11-line block (${BIG.length} chars) + 12 new lines ⇒ blockFrom keeps ALL 11 "kept" lines, never cut (${sS.length} chars) — blockFit says over ${fS.max}, so the card says so and 保存 waits`, { saved: sS.length, fit: fS });
  const fewer = { ...tS, rows: tS.rows.map((r, i) => ({ ...r, tick: i === 0, text: i === 0 ? 'Budget reviews' : r.text })) };
  const sF = RL.blockFrom(fewer);
  ok(!RL.blockFit(sF).over && own.every((l) => sF.split('\n').includes(l)), `…unticking 11 new lines and shortening the 12th brings it under (${sF.length} ≤ ${M.USER_BLOCK_MAX}) with every kept line still there`, sF.length);
  const mC = mutant("  return out.join('\\n');\n}", "  return M.userBlockOf(out.join('\\n'));\n}", 'f3');
  const cut = mC.blockFrom(tS);
  ok(own.filter((l) => cut.split('\n').includes(l)).length < own.length && cut.length === M.USER_BLOCK_MAX, `RED CONTROL (F3, §S): the old silent slice keeps ${own.filter((l) => cut.split('\n').includes(l)).length} of the 11 kept lines, the last cut mid-line («${cut.split('\n').pop()}»)`);
}

const C_NEW_R3 = "  const claimed = new Set(rows.filter((r) => r.op === 'keep').map((r) => r.line).filter(Boolean));";
console.log('⑩c ONE RULE FOR EVERY REWORDING (lane learn-card-untick, verify r3 R3-F1) — the line an edit rewords keeps a row of its own, pre-ticked or not');
{
  const BL = 'Invoices due this week matter to me\nForum digests do not';
  const EXR = [{ n: 1, snippet: 'Invoice 7 — approve today?', verdict: 'needs' }];
  const tableOf = (R, from) => R.diffTable(BL, R.normalizeProposal({ lines: [{ text: 'Invoices this week, and contracts', kind: 'edit', line: 1, from, evidence: from.length ? 'invoice 7' : '' }], removed: [], note: '' }, { block: BL, examples: EXR }));
  // the card's gesture on the table: the rewording unticked ⇒ its line's row ticked (the opposite of the rewording)
  const untick = (tb) => ({ rows: tb.rows.map((r) => ({ ...r, tick: false })), removed: tb.removed.map((r) => (r.line === 1 ? { ...r, tick: true } : r)) });
  const rowsOf = (tb) => tb.removed.map((r) => [r.op, r.line, r.tick]);
  const LONGC = Array.from({ length: 24 }, (_, i) => `contract${i}`).join(' ');   // > 120 characters ⇒ cut, unticked (F4)
  const sup = tableOf(RL, [1]), weak = tableOf(RL, []), cut = RL.diffTable(BL, RL.normalizeProposal({ lines: [{ text: LONGC, kind: 'edit', line: 1, from: [1], evidence: 'e' }], removed: [], note: '' }, { block: BL, examples: EXR }));
  ok(sup.rows[0].tick && eq(rowsOf(sup), [['replaced', 1, false], ['unmentioned', 2, true]]) && eq(rowsOf(weak), [['unproven', 1, true], ['unmentioned', 2, true]]) && eq(rowsOf(cut), [['shortened', 1, true], ['unmentioned', 2, true]]) && sup.counts.replaced === 1,
    'a PRE-TICKED (supported) rewording leaves its line a row of its own — `replaced`, unticked — as an unproven (`unproven`) and a cut one (`shortened`) do, those ticked: every rewording\'s line is a row, its tick the opposite of the rewording\'s', { sup: rowsOf(sup), weak: rowsOf(weak), cut: rowsOf(cut) });
  ok(RL.blockFrom(sup) === 'Invoices this week, and contracts\nForum digests do not' && ['sup', 'weak', 'cut'].every((k) => RL.blockFrom(untick({ sup, weak, cut }[k])) === 'Invoices due this week matter to me\nForum digests do not'),
    'ticked ⇒ the rewording replaces the line; unticked ⇒ 保存 writes the person\'s ORIGINAL line — the same for a pre-ticked, an unproven and a cut rewording', [RL.blockFrom(sup), RL.blockFrom(untick(sup))]);
  const mR = mutant(C_NEW_R3, '  const claimed = new Set(rows.filter((r) => r.tick).map((r) => r.line).filter(Boolean));', 'r3f1');
  const supM = tableOf(mR, [1]);
  ok(supM && eq(rowsOf(supM), [['unmentioned', 2, true]]) && mR.blockFrom(untick(supM)) === 'Forum digests do not', 'RED CONTROL (R3-F1): the old claim — a pre-ticked row claims its line ⇒ the line has no row, and unticking the rewording makes 保存 write «Forum digests do not» (verify r3\'s probe: line 1 gone, unsaid)', supM && { rows: rowsOf(supM), saved: mR.blockFrom(untick(supM)) });
}

console.log('⑩b THE CUT + THE STORED BLOCK (lane rule-learning-fix-r2 F4 / F6) — an over-long edit / new line is cut without a marker and never pre-ticked; the table is built on the block as stored');
const wordsOf = (n, seed = 'invoice') => { let s = ''; let i = 0; while (s.length < n) s += `${seed}${i++} `; return s.slice(0, n).replace(/\s+$/, (m) => 'x'.repeat(m.length)); };
const STORED = Array.from({ length: 14 }, (_, i) => `stored rule ${i + 1}: ` + wordsOf(110, 'legacy')).join('\n');   // 1 768 characters
{
  const MARK = /…\[\d+ characters omitted\]…|omitted/;
  const E170 = wordsOf(170, 'contract'), cE = RL.cutLine(E170, 120);
  const CJK200 = '发票合同付款审批'.repeat(25), cC = RL.cutLine(CJK200, 120);
  const cM = RL.cutLine('😀'.repeat(130), 120), cX = RL.cutLine('发票 ' + '合'.repeat(200), 120), cW = RL.cutLine('n'.repeat(200), 120);
  ok(cE.length <= 120 && E170.startsWith(cE) && /\s/.test(E170[cE.length]) && !MARK.test(cE) && cC === CJK200.slice(0, 120) && cM === '😀'.repeat(120) && Array.from(cX).length === 120 && cW === 'n'.repeat(120) && RL.cutLine('short line', 120) === 'short line',
    'cutLine: a spaced line is cut at its last word boundary inside 120 (no marker); CJK and one long word at the character; counted in characters (120 emoji = 240 UTF-16 units, never a lone surrogate)', { E: [cE.length, E170[cE.length]], C: cC.length, M: [Array.from(cM).length, cM.length], X: Array.from(cX).length });
  // verify r2's §F2-e in the brief's shape: a 152-char keep + a 170-char edit (and a 170-char new line), both with evidence
  const L152 = wordsOf(152), BLK = `${L152}\nForum digests never matter`;
  const ans = { lines: [{ text: L152, kind: 'keep', line: 1, from: [], evidence: '' }, { text: E170, kind: 'edit', line: 2, from: [1], evidence: 'one contract waited' }, { text: wordsOf(170, 'payment'), kind: 'add', line: null, from: [1], evidence: 'a payment' }], removed: [], note: '' };
  const tE = RL.diffTable(BLK, RL.normalizeProposal(ans, { block: BLK, examples: EX3 })), sE = RL.blockFrom(tE);
  const [k0, e1, a2] = tE.rows;
  ok(k0.op === 'keep' && k0.tick && k0.text === L152 && e1.op === 'edit' && e1.long && !e1.tick && !e1.unsupported && E170.startsWith(e1.text) && e1.text.length <= 120 && !MARK.test(e1.text) && e1.full === E170 && a2.op === 'add' && a2.long && !a2.tick && !MARK.test(a2.text),
    "§F2-e (verify r2): a 152-char keep + a 170-char edit + a 170-char new line, with evidence ⇒ the keep ticked, the person's line verbatim; the edit and the new line CUT at a word boundary (no marker), `long`, NOT pre-ticked, the whole text kept for the fold", tE.rows.map((r) => ({ op: r.op, tick: r.tick, long: r.long, len: r.text.length, end: r.text.slice(-16) })));
  ok(sE === BLK && eq(tE.removed.map((r) => [r.op, r.line, r.tick]), [['shortened', 2, true]]) && tE.counts.long === 2 && tE.counts.shortened === 1, "…the default 保存 writes the person's two lines — the line the cut edit rewords stays (`shortened`, ticked); never a mangled line", { saved: sE, removed: tE.removed.map((r) => [r.op, r.line]) });
  const one = RL.diffTable(L152, RL.normalizeProposal({ lines: [{ text: E170, kind: 'edit', line: 1, from: [1], evidence: 'e' }], removed: [], note: '' }, { block: L152, examples: EX3 }));
  ok(RL.blockFrom(one) === L152 && one.rows[0].long && !one.rows[0].tick, "…verify r2's own §F2-e shape (a one-line block, the 170-char edit of it): 保存 writes the person's line", RL.blockFrom(one));
  const lit = RL.normalizeProposal({ lines: [{ text: 'Short criterion …[12 characters omitted]… its tail', kind: 'add', line: null, from: [1], evidence: 'e' }, { text: '发票'.repeat(100), kind: 'add', line: null, from: [2], evidence: 'e' }], removed: [], note: '' }, { block: B3, examples: EX3 });
  ok(lit.lines[0].text === 'Short criterion' && lit.lines[0].long && lit.lines[1].text === '发票'.repeat(60) && lit.lines[1].long && RL.diffTable(B3, lit).rows.every((r) => !r.tick), 'a marker the model wrote itself is cut off with what follows it (never in a box); a 200-character CJK line is cut at 120 characters — both unticked', lit.lines.map((x) => [x.text, x.long]));
  ok(RL.LEARN_SCHEMA.properties.lines.items.properties.text.maxLength === RL.LEARN.textMax, "the strict schema bounds a line's text: maxLength 120 (the bound the task states)");
  const CUT_NEW = '    let text = long ? cutLine(head, LEARN.textMax) : head;', CUT_OLD = '    let text = clean(x.text, LEARN.textMax);';
  const LONG_NEW = "    const cut = kind !== 'keep' && long;", LONG_OLD = '    const cut = false;';
  const mF4 = MC.load('src/rule-learning.js', SRC.replace(CUT_NEW, () => CUT_OLD).replace(LONG_NEW, () => LONG_OLD), 'f4');
  const tF4 = mF4.diffTable(BLK, mF4.normalizeProposal(ans, { block: BLK, examples: EX3 }));
  ok(SRC.includes(CUT_NEW) && SRC.includes(LONG_NEW) && tF4.rows[1].tick && /characters omitted/.test(mF4.blockFrom(tF4)), "RED CONTROL (F4): the old cut ⇒ the edit is pre-ticked holding cleanPart's marker, and 保存 writes it (verify r2's F4)", mF4.blockFrom(tF4).split('\n').map((l) => l.slice(0, 70)));

  // F6: a block already over 1 500 as STORED (settings.json by hand, an API write, a value from before the box's bound)
  const inF6 = RL.buildLearnInput({ block: STORED, examples: [{ snippet: 'Invoice 7', verdict: 'needs' }] });
  const pF6 = RL.normalizeProposal({ lines: [{ text: 'stored rule 1: …', kind: 'keep', line: 1, from: [] }, { text: 'Board decisions', kind: 'edit', line: 14, from: [1], evidence: 'e' }], removed: [{ line: 13, reason: 'never seen' }], note: '' }, { block: STORED, examples: EX3, shown: inF6.lines.length });
  const tF6 = RL.diffTable(STORED, pF6), sF6 = RL.blockFrom(tF6), fF6 = RL.blockFit(sF6);
  const all14 = STORED.split('\n');
  ok(STORED.length > M.USER_BLOCK_MAX && tF6.stored.over && tF6.stored.chars === STORED.length && tF6.stored.max === M.USER_BLOCK_MAX && all14.every((l) => sF6.split('\n').includes(l)) && fF6.over,
    `a block STORED at ${STORED.length} characters (> 1 500): the table is built on it whole — all 14 lines are rows (the tail kept), \`stored\` says ${STORED.length} > 1 500, the default 保存 is over (${fF6.chars}) so the card says so and waits — never a silent cut`, { stored: tF6.stored, saved: sF6.length });
  ok(inF6.lines.length === RL.blockLines(M.userBlockOf(STORED)).length && inF6.lines.length < 14 && !inF6.messages[1].content.includes('stored rule 13:') && eq(pF6.lines.map((x) => [x.kind, x.line]), [['keep', 1], ['add', null]]) && pF6.removed.length === 0,
    `…the model is shown only the judge's read (the first 1 500 characters: ${inF6.lines.length} lines) — an edit of line 14 or a removal of line 13 (lines it never saw) names no line`, { shown: inF6.lines.length, lines: pF6.lines.map((x) => [x.kind, x.line]), removed: pF6.removed });
  const mF6 = mutant('const blockLines = (block) => str(block).split(', 'const blockLines = (block) => M.userBlockOf(block).split(', 'f6');
  const sF6m = mF6.blockFrom(mF6.diffTable(STORED, mF6.normalizeProposal({ lines: [{ text: 'x', kind: 'keep', line: 1, from: [] }], removed: [], note: '' }, { block: STORED, examples: EX3 })));
  const lostM = all14.filter((l) => !sF6m.split('\n').includes(l)).length;
  ok(!mF6.blockFit(sF6m).over && lostM > 0, `RED CONTROL (F6): the old table on userBlockOf's slice ⇒ 保存 writes ${sF6m.length} characters, ${lostM} stored lines gone (one cut mid-line) and nothing said (verify r2's F6)`, { saved: sF6m.length, lost: lostM });
}

console.log('⑪ THE WIRE (lane rule-learning-fix F1 / L2) — the REAL engine + text client over a loopback fake OpenRouter: every answer ⇒ ONE request, the routing on it ON THE WIRE');
const DE = require(path.join(repo, 'src/server/decision-engine.js'));
const TMC = require(path.join(repo, 'src/server/text-model-client.js'));
const TM_SRC = fs.readFileSync(path.join(repo, 'src/server/text-model-client.js'), 'utf8');
// the client with its FREEZE taken out (lane rule-learning-fix-r2): the wire's RED controls mutate this copy, so the wire alone
// is shown to catch them (on the frozen client a write throws first — its own leg, ⑪b)
const FREEZES = [['const body = Object.freeze({', 'const body = ({'], ["provider: Object.freeze({ zdr: true, data_collection: 'deny' }),", "provider: { zdr: true, data_collection: 'deny' },"]];
const THAW = (s) => FREEZES.reduce((x, [a, b]) => x.replace(a, b), s);
const SER = '    const bytes = new TextEncoder().encode(JSON.stringify(body));';   // a write to the request goes before this line (after it, it is dead)
const DE_SRC = fs.readFileSync(path.join(repo, 'src/server/decision-engine.js'), 'utf8');
const MCW = mutantCopies('rulelearn-wire', repo);
const ROUTING = { zdr: true, data_collection: 'deny' };
const quiet = { log() { }, warn() { }, error() { } };
const WIRE_ROOT = scratch('rulelearn-wire');
process.on('exit', () => { try { fs.rmSync(WIRE_ROOT, { recursive: true, force: true }); } catch { } });
const wire = [];
let plan = [];
const PROPOSAL = { lines: [{ text: 'Invoices due today', kind: 'add', line: null, from: [1], evidence: 'one invoice waited' }], removed: [], note: '' };
let OTHER = 0;
const fakeOr = (srv) => http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    let body = null; try { body = JSON.parse(raw); } catch { }
    wire.push({ srv, path: req.url, body });
    const j = (s, o, h = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
    if (srv === 'other') return j(200, { choices: [{ message: { content: JSON.stringify(PROPOSAL) } }], answers: [] });
    const b = plan.length ? plan.shift() : 'ok';
    if (b === 'ok' || b === 'slow') {
      if (b === 'slow') await new Promise((r) => setTimeout(r, 250));
      return j(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify(PROPOSAL) } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 } });
    }
    if (b === 'reset') return req.socket.destroy();
    if (b === 'hang') return;
    if (b === 'nonjson') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>oops</html>'); }
    if (b === 'nochoice') return j(200, { usage: { prompt_tokens: 10, completion_tokens: 0, cost: 0.0001 } });
    if (b === 'half') {   // a 200 whose body stops mid-JSON: the headers promise it all, 40 bytes come, the socket ends (lane learn-card-untick R3-F2)
      const whole = JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(PROPOSAL) } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 } });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(whole)) }); res.write(whole.slice(0, 40));
      return setTimeout(() => res.socket.destroy(), 10);
    }
    if (b.redirect) { res.writeHead(b.redirect, { location: `http://127.0.0.1:${OTHER}${req.url}` }); return res.end(); }
    return j(b.status, { error: { message: b.message || 'refused' } }, b.headers || {});
  });
});
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const orSrv = fakeOr('or'), otherSrv = fakeOr('other');
const OR = await listen(orSrv);
OTHER = await listen(otherSrv);
const KEYW = ['sk-or-v1-', 'e'.repeat(40)].join('');
const ROW = { resolveIntegration: () => ({ values: { provider: 'openrouter', apiKey: KEYW }, source: 'user' }) };
let wn = 0;
const mkEng = (cfg = {}, Engine = DE) => {
  const dataDir = path.join(WIRE_ROOT, `e${++wn}`); fs.mkdirSync(dataDir, { recursive: true });
  const e = Engine.create({ dataDir, integrations: ROW, baseUrlFor: { openrouter: `http://127.0.0.1:${OR}` }, now: () => Date.UTC(2026, 9, 14, 12), tzOffset: () => 0, log: quiet });
  e.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ dailyBudgetCents: 100, learnModel: 'flash', rules: true, ...cfg }) });
  e.journalRows = () => { try { return fs.readFileSync(e.files.journal, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return e;
};
const IN = RL.buildLearnInput({ block: 'Invoices matter to me.', examples: [{ snippet: 'Invoice 7 — approve today?', verdict: 'needs' }] });
const press = (client) => client.complete({ use: 'learn', messages: IN.messages, schema: RL.LEARN_SCHEMA, est: IN.est });
const CASES = [
  ['ok', 'ok'], [{ status: 404, message: 'No endpoints found matching your data policy' }, 'no-zdr'], [{ status: 400, message: 'zdr: no endpoints' }, 'no-zdr'],
  [{ status: 400, message: 'Invalid schema' }, 'shape'], [{ status: 401 }, 'reconnect'], [{ status: 402 }, 'plan'], [{ status: 403 }, 'reconnect'], [{ status: 408 }, 'shape'],
  [{ status: 422 }, 'shape'], [{ status: 429, headers: { 'retry-after': '1' } }, 'vendor-busy'], [{ status: 500 }, 'vendor-busy'], [{ status: 502 }, 'vendor-busy'], [{ status: 503 }, 'vendor-busy'],
  ['reset', 'vendor-busy'], ['nonjson', 'bad-answer'], ['nochoice', 'bad-answer'], ['half', 'bad-answer'], [{ redirect: 307 }, 'redirect'], [{ redirect: 302 }, 'redirect'], [{ redirect: 308 }, 'redirect'],
];
/** every answer through `client` → the cases whose wire broke the law: ≠ 1 request, a request elsewhere, or a provider ≠ the literal */
async function wireLaw(client, e, cases = CASES) {
  const broke = [];
  for (const [b, want] of cases) {
    plan = [b]; const n = wire.length;
    const r = await press(client).catch((err) => ({ ok: false, why: `threw ${err && err.name}` }));
    const got = wire.slice(n), st = e.status().today;
    const why = r.ok ? 'ok' : r.why;
    if (got.length !== 1 || got.some((q) => q.srv !== 'or' || !q.body || !eq(q.body.provider, ROUTING)) || why !== want || st.reserved !== 0 || st.inFlight !== 0) broke.push({ answer: typeof b === 'string' ? b : JSON.stringify(b), why, want, requests: got.map((q) => `${q.srv}:${q.body ? JSON.stringify(q.body.provider) : '-'}`) });
  }
  plan = [];
  return broke;
}
{
  const e = mkEng();
  const t0 = Date.now();
  const broke = await wireLaw(e.textModel, e);
  ok(broke.length === 0, `${CASES.length} vendor answers (200 · 404 / 400 no-zdr · 400 / 408 / 422 shape · 401 / 403 · 402 · 429 · 5xx ×3 · a reset · a non-JSON body · no choices · a half body · 307 / 302 / 308) ⇒ each EXACTLY one request to OpenRouter, \`provider\` deep-equal to {zdr: true, data_collection: 'deny'} on the wire, the named why, the reservation gone (${Date.now() - t0} ms)`, broke);
  const tc = TMC.create({ integrations: ROW, ledger: e.ledger, baseUrl: `http://127.0.0.1:${OR}`, timeoutMs: 250, log: quiet });
  const hang = await wireLaw(tc, e, [['hang', 'vendor-busy']]);
  ok(hang.length === 0, 'a vendor that never answers (the 250 ms timeout) ⇒ one request with the routing, vendor-busy — never a second one', hang);
  const jl = e.journalRows().filter((x) => x.use === 'learn');
  ok(jl.length === CASES.length + 1 && jl.every((x) => x.zdr === true) && !JSON.stringify(jl).includes(KEYW) && jl.filter((x) => x.outcome === 'redirect').length === 3, `the journal: ${jl.length} learn lines, zdr true on each, no key; the three 3xx are \`redirect\``, jl.slice(-3));
  ok(wire.filter((q) => q.srv === 'other').length === 0, 'L2: no request ever reached the redirect\'s other origin (redirect: \'error\' — never followed)');
  // RED CONTROLS — the census-mutants of verify r1 as copies of the client over the same ledger: each breaks the wire law
  const U = '    const u = json ? usageOf(json)', LET = "    let status = 0, json = null, message = '', failed = null, sending = null;", ROUTE_LINE = "      provider: { zdr: true, data_collection: 'deny' },";
  const TS = THAW(TM_SRC);
  ok(FREEZES.every(([a]) => TM_SRC.includes(a)) && FREEZES.every(([, b]) => TS.includes(b)) && TM_SRC.includes(SER), 'the shipped client freezes the request and its routing and serializes it once (the controls below mutate a copy with both freezes taken out)');
  const muts = {
    'M3 a non-ZDR retry': TS.replace(U, "    if (status === 0) { try { const r2 = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, provider: undefined }) }); status = r2.status; json = await r2.json().catch(() => null); } catch { } }\n" + U),
    'M2 the literal overridden': TS.replace(SER, "    Object.assign(body, { provider: { data_collection: 'allow' } });\n" + SER),
    'M8b the literal in a dead branch': TS.replace(ROUTE_LINE, "      ...(false ? { provider: { zdr: true, data_collection: 'deny' }, } : {}),"),
    'L2 redirects followed': TS.replace(", redirect: 'error' });", ' });'),
  };
  for (const [name, src] of Object.entries(muts)) {
    if (src === TS) { ok(false, `mutant anchor missing: ${name}`); continue; }
    const C = MCW.load('src/server/text-model-client.js', src, name.split(' ')[0].toLowerCase());
    const eM = mkEng();
    const broken = await wireLaw(C.create({ integrations: ROW, ledger: eM.ledger, baseUrl: `http://127.0.0.1:${OR}`, log: quiet }), eM);
    ok(broken.length > 0, `RED CONTROL (${name}): the wire law breaks on ${broken.length} answer(s) — e.g. ${broken[0] ? `${broken[0].answer} ⇒ ${broken[0].requests.join(' + ')}` : 'none'}`, broken.slice(0, 2));
  }
}

console.log('⑪b THE WIRE SWEEP (lane rule-learning-fix-r2 F1) — every status 300–599 + a reset / non-JSON / no choices / five 3xx redirects + a hang, on BOTH tiers: each ONE request, the routing deep-equal on the wire');
const SWEEP = [...Array.from({ length: 300 }, (_, i) => ({ status: 300 + i })), 'reset', 'nonjson', 'nochoice', 'half', ...[301, 302, 303, 307, 308].map((s) => ({ redirect: s })), 'hang'];
const answerName = (b) => (typeof b === 'string' ? b : b.redirect ? `${b.redirect} → another origin` : `HTTP ${b.status}`);
/** Every answer of SWEEP through `build(engine, timeoutMs)` (the REAL engine's own client by default) on each tier → {broke,
 *  n}: a case breaks the law on ≠ 1 request, a request elsewhere, a `provider` ≠ the routing, or a model ≠ the tier's. */
async function sweepLaw(build, { tiers = ['flash', 'sonnet'], first = false } = {}) {
  const broke = []; let n = 0;
  for (const tier of tiers) {
    const model = RL.MODELS[tier].id, est = RL.learnCost(tier, IN.est, RL.LEARN.outputMax);
    let e = null, client = null;
    for (const b of SWEEP) {
      // a fresh engine (a fresh day's use cap) when the next hold would not fit — a 3xx / a reset keep their reservation
      if (!e || b === 'hang' || e.ledger.useUsd('learn') + est > RL.USE_CAP_CENTS.learn / 100) { e = mkEng({ learnModel: tier }); client = build(e, b === 'hang' ? 250 : 0); }
      plan = [b]; const k = wire.length; n++;
      const r = await press(client).catch((err) => ({ ok: false, why: `threw ${err && err.name}` }));
      const got = wire.slice(k);
      if (got.length !== 1 || got.some((q) => q.srv !== 'or' || !q.body || !eq(q.body.provider, ROUTING) || q.body.model !== model)) {
        broke.push({ tier, answer: answerName(b), why: r.ok ? 'ok' : r.why, requests: got.map((q) => `${q.srv}:${q.body ? JSON.stringify(q.body.provider) : '-'}`) });
        if (first) { plan = []; return { broke, n }; }
      }
    }
  }
  plan = [];
  return { broke, n };
}
const clientOf = (Mod) => (e, t) => (Mod ? Mod.create({ integrations: ROW, ledger: e.ledger, baseUrl: `http://127.0.0.1:${OR}`, ...(t ? { timeoutMs: t } : {}), log: quiet }) : t ? TMC.create({ integrations: ROW, ledger: e.ledger, baseUrl: `http://127.0.0.1:${OR}`, timeoutMs: t, log: quiet }) : e.textModel);
{
  const t0 = Date.now(), other0 = wire.filter((q) => q.srv === 'other').length;
  const s = await sweepLaw(clientOf(null));
  ok(s.broke.length === 0 && s.n === 2 * SWEEP.length, `${s.n} answers (${SWEEP.length} a tier × Flash + Sonnet: HTTP 300–599 · a reset · a non-JSON body · no choices · a half body · 301 / 302 / 303 / 307 / 308 to another origin · a hang) ⇒ each EXACTLY one request to OpenRouter, \`provider\` deep-equal to {zdr: true, data_collection: 'deny'}, the tier's model (${Date.now() - t0} ms)`, s.broke.slice(0, 4));
  ok(wire.filter((q) => q.srv === 'other').length === other0, '…and not one request reached the other origin of the five redirects');
  // RED CONTROLS — verify r2's roads + two the 19 answers never met, each on the THAWED client (the sweep alone catches
  // them, whatever their spelling); then the freeze on its own: a write on the shipped, frozen request throws, nothing leaves
  const TS = THAW(TM_SRC);
  const U = '    const u = json ? usageOf(json)';
  const sweepMuts = {
    'N3 a non-ZDR retry on a 504 through fetch.call': TS.replace(U, "    if (status === 504) { const r2 = await fetch.call(null, url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, provider: undefined }) }); status = r2.status; const j2 = await r2.json().catch(() => null); if (r2.ok) json = j2; }\n" + U),
    'N2b the routing written on the Sonnet tier': TS.replace(SER, "    if (tier.key === 'sonnet') body.provider.data_collection = 'allow';\n" + SER),
    'N2c an alias of the routing written on the Sonnet tier': TS.replace(SER, "    const route = body.provider; if (tier.key === 'sonnet') route.zdr = false;\n" + SER),
    'a retry without the routing on a 3xx that is no redirect': TS.replace(U, "    if (status >= 300 && status < 400) { const r2 = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, provider: undefined }) }); status = r2.status; }\n" + U),
    'the serialized body edited on the Sonnet tier (on the FROZEN client: no write, so no freeze sees it)': TM_SRC.replace('const bytes = new TextEncoder().encode(JSON.stringify(body));', "const bytes = new TextEncoder().encode(tier.key === 'sonnet' ? JSON.stringify(body).replace('\"zdr\":true', '\"zdr\":false') : JSON.stringify(body));"),
    'a string body again (Node\'s fetch re-sends it, empty, on a 421)': TM_SRC.replace("body: M.oneShotBody(bytes), duplex: 'half',", 'body: JSON.stringify(body),').replace(", 'content-length': String(bytes.length)", ''),
  };
  let i = 0;
  for (const [name, src] of Object.entries(sweepMuts)) {
    if (src === TS || src === TM_SRC) { ok(false, `mutant anchor missing: ${name}`); continue; }
    const r = await sweepLaw(clientOf(MCW.load('src/server/text-model-client.js', src, `sweep${++i}`)), { first: true, tiers: ['sonnet', 'flash'] });
    ok(r.broke.length > 0, `RED CONTROL (${name}): the sweep breaks at ${r.broke[0] ? `${r.broke[0].tier} · ${r.broke[0].answer} ⇒ ${r.broke[0].requests.join(' + ') || 'no request'}` : 'nothing'} (answer ${r.n})`, r.broke.slice(0, 1));
  }
  const FR = MCW.load('src/server/text-model-client.js', TM_SRC.replace(SER, "    if (tier.key === 'sonnet') body.provider.data_collection = 'allow';\n" + SER), 'frozen-n2b');
  const eF = mkEng({ learnModel: 'sonnet' }); plan = ['ok']; const kF = wire.length;
  const thrown = await press(clientOf(FR)(eF, 0)).then(() => null, (err) => err);
  plan = [];
  ok(thrown instanceof TypeError && wire.length === kF, `the FREEZE on its own (verify r2's N2b on the shipped, frozen client): the write throws («${thrown && thrown.message}») — not one request leaves`, { thrown: thrown && thrown.message, requests: wire.length - kF });
  // lane learn-card-untick — verify r3's S5 (R3-F2): the ONE call site in a loop, a second pass when the body read fails half
  // way — GREEN on every census (no new token) and on the sweep until it drove a half body; planted on the FROZEN client
  // (it writes nothing), so only the half-body answer can catch it
  const S5_AT = '      sending = fetch(url, ', S5_RES = '      const res = await sending;\n      status = res.status;\n      const j = await res.json().catch(() => null);\n';
  const s5 = TM_SRC.includes(S5_AT) && TM_SRC.includes(S5_RES) ? TM_SRC.replace(S5_AT, '      let res = null, j = null;\n      for (let a = 0; a < 2; a++) {\n' + S5_AT)
    .replace(S5_RES, "      res = await sending;\n      status = res.status;\n      let half = false;\n      j = await res.json().catch((e) => { half = a === 0 && !!e && e.name === 'TypeError'; return null; });\n      if (!half) break;\n      }\n") : null;
  const r5 = s5 && await sweepLaw(clientOf(MCW.load('src/server/text-model-client.js', s5, 'sweep-s5')), { first: true, tiers: ['sonnet', 'flash'] });
  ok(r5 && r5.broke.length > 0 && r5.broke[0].answer === 'half', `RED CONTROL (verify r3 S5 — a retry through the ONE call site on a half body): the sweep breaks at ${r5 && r5.broke[0] ? `${r5.broke[0].tier} · ${r5.broke[0].answer} ⇒ ${r5.broke[0].requests.join(' + ')}` : 'nothing'} (answer ${r5 && r5.n})`, r5 && r5.broke.slice(0, 1));
}

console.log('⑪c THE STORED BLOCK THROUGH learnDraft (lane rule-learning-fix-r2 F6) — the real engine + attention module, a block stored over 1 500');
{
  const CA = require(path.join(repo, 'src/server/channels-attention.js'));
  const e = mkEng();
  const dataDir = path.join(WIRE_ROOT, 'stored'); fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'decision-examples.json'), JSON.stringify({ v: 1, examples: [{ key: 'k1', lastAt: 1, snippet: 'Invoice 7 — approve today?', verdict: 'needs', at: 1 }, { key: 'k2', lastAt: 2, snippet: 'Forum digest', verdict: 'not', at: 2 }] }));
  const att = CA.create({ dataDir, decision: e, serverSetting: (k) => (k === 'decision.attentionBlock' ? STORED : undefined), log: quiet });
  plan = ['ok']; const k = wire.length;
  const r = await att.learnDraft();
  plan = [];
  const sent = wire.slice(k), user = sent[0] && sent[0].body ? sent[0].body.messages[1].content : '';
  const saved = r.ok ? RL.blockFrom(r.table) : '';
  ok(r.ok && sent.length === 1 && r.table.stored.over && r.table.stored.chars === STORED.length && STORED.split('\n').every((l) => saved.split('\n').includes(l)) && RL.blockFit(saved).over && user.includes('1. stored rule 1:') && !user.includes('stored rule 13:'),
    `learnDraft on a block stored at ${STORED.length} characters: ONE request carrying only the judge's read (no line past 1 500), the answer's table on the WHOLE block (stored.over, all 14 lines kept) — the card says it and waits`, r.ok ? { stored: r.table.stored, rows: r.table.rows.length, kept: r.table.removed.length } : r);
}

console.log('⑫ THE JUDGE\'S REDIRECT (lane rule-learning-fix L2 — the same vendor row): a 3xx ⇒ the named refusal, zero second requests');
{
  const Q = [{ type: 'predicate', name: 'q1', instructions: 'Does the text ask the reader to pay something?' }];
  const judgeOnce = async (Engine, status = 307) => {
    const e = mkEng({}, Engine);
    plan = [{ redirect: status }]; const n = wire.length;
    const r = await e.judge('rule', { body: 'Please pay the invoice.', thread: [] }, { questions: Q }).catch((x) => ({ ok: false, why: `threw: ${x.message}` }));
    plan = [];
    return { r, got: wire.slice(n), st: e.status().today, jl: e.journalRows() };
  };
  const a = await judgeOnce(DE);
  ok(!a.r.ok && a.r.why === 'redirect' && a.r.retryAt > 0 && a.got.length === 1 && a.got[0].srv === 'or' && a.st.total.usd === 0 && a.st.reserved === 0 && a.jl.some((x) => x.outcome === 'redirect'), 'a 307 on the decisions endpoint ⇒ `redirect` (journalled, paced like a wall), ONE request, nothing to the other origin, $0 settled', { r: a.r, got: a.got.map((q) => q.srv), usd: a.st.total.usd });
  const follow = DE_SRC.replace(", redirect: 'error' });   // a 3xx is never followed (lane rule-learning-fix L2)", ' });');
  // lane judge-one-shot-body: the judge's body is a ONE-SHOT stream now — a followed 307 / 308 has no source to re-send, so
  // that copy fails closed (nothing reaches the other origin); a 303 is still followed (a GET, no body) — the control
  const FOLLOW = follow === DE_SRC ? null : MCW.load('src/server/decision-engine.js', follow, 'judge-follow');
  const b = FOLLOW && await judgeOnce(FOLLOW, 303), b7 = FOLLOW && await judgeOnce(FOLLOW, 307);
  ok(b && b.got.some((q) => q.srv === 'other'), 'RED CONTROL: the judge without redirect: \'error\' follows a 303 — a request goes to the OTHER origin', b && b.got.map((q) => q.srv));
  ok(b7 && b7.got.length === 1 && b7.got[0].srv === 'or' && !b7.r.ok, '…and the same copy on a 307: the one-shot body cannot be re-sent, so not even a following judge carries the question to the other origin (the second defence — lane judge-one-shot-body)', b7 && { r: b7.r, got: b7.got.map((q) => q.srv) });
}

console.log('⑬ ONE DRAFT AT A TIME (lane rule-learning-fix L4) — the REAL channels router: a POST while one is in flight ⇒ 409 busy, 0 requests');
{
  const express = require(path.join(repo, 'node_modules/express'));
  const ENG = require(path.join(repo, 'src/server/channels-engine.js'));
  const CH = require(path.join(repo, 'src/channels/index.js'));
  const e = mkEng();
  const dataDir = path.join(WIRE_ROOT, 'route'); fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'decision-examples.json'), JSON.stringify({ v: 1, examples: [{ key: 'k1', lastAt: 1, snippet: 'Invoice 7 — approve today?', verdict: 'needs', at: 1 }, { key: 'k2', lastAt: 2, snippet: 'Forum digest', verdict: 'not', at: 2 }] }));
  const eng = ENG.create({ dataDir, registry: CH.createChannelRegistry(), env: {}, broadcast: () => { }, serverSetting: (k) => (k === 'decision.attentionBlock' ? 'Invoices matter to me.' : undefined), liveSessions: () => [], deliver: null, log: quiet, decisionEngine: e });
  const serve = async (routesMod) => {
    routesMod.setup({ getEngine: () => eng });
    const app = express(); app.use(express.json()); app.use(routesMod.router);
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const post = async () => { const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/channels/decision/learn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); return { s: res.status, j: await res.json().catch(() => null) }; };
    return { srv, post };
  };
  const { srv, post } = await serve(require(path.join(repo, 'src/routes/channels.js')));
  plan = ['slow']; const n = wire.length;
  const two = await Promise.all([post(), post()]);
  const third = await post();
  plan = [];
  const busy = two.find((x) => x.s === 409);
  ok(two.map((x) => x.s).sort().join() === '200,409' && busy && busy.j.why === 'busy' && busy.j.ok === false && wire.length - n === 2 && third.s === 200, 'two POSTs at once ⇒ 200 + 409 `busy` (ONE vendor request); the next POST after it ⇒ 200 again (the flight is released)', { statuses: two.map((x) => x.s), busy: busy && busy.j, requests: wire.length - n, third: third.s });
  srv.close();
  const RT_SRC = fs.readFileSync(path.join(repo, 'src/routes/channels.js'), 'utf8');
  const noGate = RT_SRC.replace("    if (learnInFlight) return res.status(409).json({ ok: false, why: 'busy', error: 'a draft is already being made' });\n", '');
  if (noGate === RT_SRC) ok(false, 'mutant anchor missing: the single-flight line');
  else {
    const m = await serve(MCW.load('src/routes/channels.js', noGate, 'no-flight'));
    plan = ['slow', 'slow']; const k = wire.length;
    const both = await Promise.all([m.post(), m.post()]);
    plan = [];
    ok(both.every((x) => x.s === 200) && wire.length - k === 2, 'RED CONTROL: the route without the single-flight line ⇒ two presses at once = TWO vendor requests (two holds)', both.map((x) => x.s));
    m.srv.close();
  }
}

console.log('⑬b THE DRAFTER\'S OWN SWITCH (lane llm-plugin-rename) — the REAL router: off ⇒ 404 naming the switch; another provider ⇒ 404 naming the provider; 0 requests');
{
  const express = require(path.join(repo, 'node_modules/express'));
  const ENG = require(path.join(repo, 'src/server/channels-engine.js'));
  const CH = require(path.join(repo, 'src/channels/index.js'));
  const routes = require(path.join(repo, 'src/routes/channels.js'));
  const ask = async (decisionEngine, tag) => {
    const dataDir = path.join(WIRE_ROOT, 'switch-' + tag); fs.mkdirSync(dataDir, { recursive: true });
    const eng = ENG.create({ dataDir, registry: CH.createChannelRegistry(), env: {}, broadcast: () => { }, serverSetting: () => undefined, liveSessions: () => [], deliver: null, log: quiet, decisionEngine });
    routes.setup({ getEngine: () => eng });
    const app = express(); app.use(express.json()); app.use(routes.router);
    const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const url = `http://127.0.0.1:${srv.address().port}/api/channels/decision/learn`;
    const g = await fetch(url); const gj = await g.json().catch(() => null);
    const p = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const pj = await p.json().catch(() => null);
    srv.close();
    return { g: g.status, gj: gj || {}, p: p.status, pj: pj || {} };
  };
  const n = wire.length;
  const off = await ask(mkEng({ learn: false }), 'off');
  ok(off.g === 404 && off.p === 404 && off.gj.code === 'no-learn' && off.gj.why === 'learn-off' && off.pj.why === 'learn-off' && /switched off/.test(off.gj.error) && /Settings › Plugins › LLM/.test(off.gj.error),
    `the switch OFF ⇒ GET and POST answer 404 no-learn naming the switch («${off.gj.error}»)`, off);
  ok(mkEng({}).textModel.available().exists === true && mkEng({ learn: true }).textModel.available().exists === true, 'the switch absent (its default) or on ⇒ the drafter exists on an OpenRouter key');
  const dataDir = path.join(WIRE_ROOT, 'openai'); fs.mkdirSync(dataDir, { recursive: true });
  const oai = DE.create({ dataDir, integrations: { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: KEYW }, source: 'user' }) }, baseUrlFor: { openrouter: `http://127.0.0.1:${OR}` }, now: () => Date.UTC(2026, 9, 14, 12), tzOffset: () => 0, log: quiet });
  oai.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ dailyBudgetCents: 100, learnModel: 'flash', learn: true }) });
  const other = await ask(oai, 'openai');
  ok(other.g === 404 && other.p === 404 && other.gj.why === 'not-openrouter' && /OpenRouter key/.test(other.gj.error) && /another provider/.test(other.gj.error), `an OpenAI key ⇒ 404 naming the provider («${other.gj.error}»)`, other);
  ok(wire.length === n, `0 vendor requests for either (${wire.length - n})`);
}

console.log('⑭ EVERY REFUSAL HAS WORDS (lane rule-learning-fix L5) + the registry row names both consumers (L6)');
{
  const CARD = fs.readFileSync(path.join(repo, 'src/lib/learn-card.js'), 'utf8');
  const RT = fs.readFileSync(path.join(repo, 'src/routes/channels.js'), 'utf8');
  const cardWhys = (text) => {
    const i = text.indexOf('const REFUSALS = () => ({'), j = text.indexOf('\n});', i);
    const span = i < 0 ? '' : text.slice(i, j);
    return new Set([...span.matchAll(/(?:^|,)\s*(?:'([\w-]+)'|([a-z][\w]*))\s*:\s*t\(/gm)].map((m) => m[1] || m[2]));
  };
  const literalsIn = (expr) => [...expr.matchAll(/'([a-z][\w-]*)'/g)].map((m) => m[1]);
  const whyExprs = (text) => [...text.matchAll(/\bwhy:\s*([^,}\n]+)/g)].flatMap((m) => literalsIn(m[1]));
  // the budget verdict's whys REACHABLE from the client's own call: its arguments read off the source, each literal held,
  // each variable swept over its range (an argument the census has no range for is a problem by name)
  const RANGE = { pluginOn: [false, true], featureOn: [false, true], keyPresent: [false, true], accountNever: [false, true], reconnect: [false, true], plan: [false, true], shape: [false, true],
    backoffUntil: [0, 1e15], now: [0], spentUsd: [0, 1e6], estUsd: [0.01], ceilingCents: [100], ceilingUsd: [1], hourCount: [0, 1e9], perHour: [1, Infinity], useSpentUsd: [0, 1e6], useCeilingCents: [10] };
  const budgetWhys = (text, problems) => {
    const i = text.indexOf('M.budgetVerdict({'); if (i < 0) { problems.push('no budgetVerdict call'); return []; }
    const args = text.slice(i + 'M.budgetVerdict({'.length, text.indexOf('})', i)).split(',').map((s) => s.trim()).filter(Boolean);
    let grid = [{}];
    for (const a of args) {
      const [k, v] = a.includes(':') ? [a.slice(0, a.indexOf(':')).trim(), a.slice(a.indexOf(':') + 1).trim()] : [a, a];
      const lit = /^(true|false|\d+(\.\d+)?)$/.test(v) ? [JSON.parse(v)] : RANGE[k];
      if (!lit) { problems.push(`budgetVerdict argument ${k} has no range in the census`); continue; }
      grid = grid.flatMap((g) => lit.map((x) => ({ ...g, [k]: x })));
    }
    return [...new Set(grid.map((g) => M.budgetVerdict(g)).filter((v) => !v.ok).map((v) => v.why))];
  };
  const routeWhys = (srcs, problems) => {
    const ld = fnSource(srcs.att, 'learnDraft'), rf = fnSource(srcs.tm, 'refusalOf'), cp = fnSource(srcs.tm, 'complete');
    const post = srcs.rt.slice(srcs.rt.indexOf("router.post('/api/channels/decision/learn'"), srcs.rt.indexOf('\n});', srcs.rt.indexOf("router.post('/api/channels/decision/learn'")));
    return new Set([
      ...budgetWhys(cp, problems), ...whyExprs(cp), ...literalsIn((/const why = ([^;]+);/.exec(cp) || ['', ''])[1]), ...[...rf.matchAll(/return '([\w-]+)'/g)].map((m) => m[1]),
      ...whyExprs(ld), ...whyExprs(post), ...whyExprs(fnSource(srcs.rl, 'availability')), ...whyExprs(fnSource(srcs.rl, 'normalizeProposal')),
    ]);
  };
  const srcs = { tm: TM_SRC, att: ATT, rt: RT, rl: SRC };
  const problems = [];
  const all = routeWhys(srcs, problems), words = cardWhys(CARD);
  const missing = [...all].filter((w) => !words.has(w));
  ok(problems.length === 0 && all.size >= 15 && ['busy', 'redirect', 'no-answer', 'use-budget', 'no-zdr', 'vendor-busy', 'bad-answer', 'not-openrouter'].every((w) => all.has(w)) && missing.length === 0, `CENSUS: the ${all.size} whys the learn route can answer — derived from the client (its budget call swept, its refusals), learnDraft, the route and the PURE drafter — each has a sentence in the card's map (${[...all].sort().join(' · ')})`, { missing, problems });
  const planted = TM_SRC.replace('    if (!ledger) return { ok: false, why: \'plugin-off\' };', '    if (!ledger) return { ok: false, why: \'plugin-off\' };\n    if (!messages.length) return { ok: false, why: \'empty-input\' };');
  const swept = TM_SRC.replace('featureOn: true, keyPresent: !!key,', 'featureOn: true, keyPresent: !!key, accountNever: s.never,');
  const p2 = [];
  ok(planted !== TM_SRC && [...routeWhys({ ...srcs, tm: planted }, p2)].filter((w) => !words.has(w)).join() === 'empty-input' && swept !== TM_SRC && [...routeWhys({ ...srcs, tm: swept }, p2)].filter((w) => !words.has(w)).join() === 'account-never', 'RED CONTROLS: a new refusal literal in the client (empty-input) and a budget argument that makes account-never reachable — each a why without words (RED)', p2);
  const R = require(path.join(repo, 'src/integration-registry.js'));
  const row = R.rowById('llm'), help = row.fields.find((f) => f.key === 'provider').help;
  const helpText = typeof help === 'string' ? help : JSON.stringify(help);
  ok(eq(row.consumers, ['src/server/decision-engine.js', 'src/server/text-model-client.js']) && helpText.includes('/api/alpha/decisions') && helpText.includes('/api/v1/chat/completions'), 'L6: the Language model row lists BOTH consumers of its key (the judge, the text client) and its help names both endpoints', { consumers: row.consumers, help: helpText.slice(0, 260) });
}

console.log('⑮ THE CARD (lane rule-learning-fix F2 / F3 / L5) — the REAL learn-card.js (zh) over a fake DOM: the long kept line, the count, the empty block, the door, the refusals');
{
  const esbuild = require(path.join(repo, 'node_modules/esbuild'));
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this.className = ''; this._text = ''; this.parent = null; this.title = ''; this.value = ''; this.checked = false; this.type = ''; this.disabled = false; this.hidden = false; this.onclick = null; this.maxLength = -1; }
    appendChild(c) { if (c.parent) c.remove(); c.parent = this; this.children.push(c); return c; }
    append(...cs) { for (const c of cs) this.appendChild(c); }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
    replaceWith(n) { const p = this.parent; p.children[p.children.indexOf(this)] = n; n.parent = p; this.parent = null; }
    get isConnected() { let p = this; while (p.parent) p = p.parent; return p === DOC_BODY; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    focus() { }
    matches(sel) {
      let m;
      if ((m = /^\.([\w-]+)$/.exec(sel))) return this.className.split(/\s+/).includes(m[1]);
      if ((m = /^\[data-([\w-]+)\]$/.exec(sel))) return m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()) in this.dataset;
      return this.tagName === sel.toUpperCase();
    }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    querySelectorAll(sel) { return this.all().filter((e) => e.matches(sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  const DOC_BODY = new El('body');
  globalThis.document = { createElement: (t) => new El(t), body: DOC_BODY };
  globalThis.localStorage = { getItem: (k) => (k === 'vibespace.lang' ? 'zh' : null), setItem() { }, removeItem() { } };
  try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true }); } catch { }
  globalThis.__toasts = [];
  const out = path.join(WIRE_ROOT, 'learn-card.bundle.cjs');
  const stub = { name: 'stub-utils', setup(b) {
    b.onResolve({ filter: /\/utils\.js$/ }, () => ({ path: 'utils-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const fetchJson = (...a) => globalThis.__fetchJson(...a); export const showToast = (...a) => globalThis.__toasts.push(a);', loader: 'js' }));
  } };
  await esbuild.build({ stdin: { contents: `export * from ${JSON.stringify(path.join(repo, 'src/lib/learn-card.js'))};`, resolveDir: repo, loader: 'js' }, bundle: true, format: 'cjs', platform: 'neutral', outfile: out, plugins: [stub], logLevel: 'error', mainFields: ['module', 'main'] });
  const LC = require(out);
  const bundleCard = async (src, tag) => { const o = path.join(WIRE_ROOT, `learn-card.${tag}.cjs`); await esbuild.build({ stdin: { contents: src, resolveDir: path.join(repo, 'src/lib'), sourcefile: 'learn-card.js', loader: 'js' }, bundle: true, format: 'cjs', platform: 'neutral', outfile: o, plugins: [stub], logLevel: 'error', mainFields: ['module', 'main'] }); return require(o); };
  const EXN = [{ n: 1, verdict: 'needs', inferred: false, snippet: 'Invoice 7 — approve today?' }, { n: 2, verdict: 'not', inferred: false, snippet: 'Forum digest' }];
  const answerOf = (block, raw) => ({ ok: true, label: 'Gemini 3.8 Flash', usd: 0.004, read: 2, counts: { own: 2, inferred: 0 }, examples: EXN, table: RL.diffTable(block, RL.normalizeProposal(raw, { block, examples: EXN })), note: '' });
  const look = (card) => ({ fit: card.querySelector('.learn-fit'), save: card.querySelector('.learn-save') });
  // F2: the long kept line — a ticked 原样保留 row whose box holds the WHOLE line; 保存 writes it
  const got = [];
  const c1 = LC.renderLearnCard(answerOf(LONG, { lines: [{ text: M.cleanPart(LONG, 120, 'line'), kind: 'keep', line: 1, from: [], evidence: '' }], removed: [], note: '' }), { onSave: (x) => { got.push(x); return true; } });
  const row1 = c1.querySelector('.learn-text');
  ok(c1.querySelector('.learn-chip').textContent === '原样保留' && c1.querySelector('.learn-tick').checked && row1.value === LONG && row1.maxLength >= LONG.length && look(c1).fit.hidden && look(c1).save.textContent === '保存', `§G-F2 the ${LONG.length}-char line the model kept (its copy cut with an elision): 原样保留, ticked, the box holds the WHOLE line, no notice, 「保存」`, { chip: c1.querySelector('.learn-chip').textContent, len: row1.value.length });
  look(c1).save.onclick();
  ok(got[0] === LONG, '§G-F2 …保存 writes the block whole (the verifier\'s probe saved "")', got);
  // F3: the 11 kept + 12 new ⇒ the notice, 保存 waits; unticking new lines until it fits releases it — nothing was cut
  const own = Array.from({ length: 11 }, (_, i) => `rule ${String(i + 1).padStart(2, '0')}: ` + `the person's own words about what matters, line ${i + 1} `.repeat(3).slice(0, 118));
  const BIG = own.join('\n');
  const EXB = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, verdict: 'needs', inferred: false, snippet: `ex ${i + 1}` }));
  const r12 = { lines: Array.from({ length: 12 }, (_, i) => ({ text: `new criterion ${i + 1}: ` + 'messages about the quarterly budget review that ask me directly '.slice(0, 92), kind: 'add', line: null, from: [i + 1], evidence: 'seen' })), removed: [], note: '' };
  const big = { ...answerOf(BIG, r12), examples: EXB, table: RL.diffTable(BIG, RL.normalizeProposal(r12, { block: BIG, examples: EXB })) };
  const saved3 = [];
  const c3 = LC.renderLearnCard(big, { onSave: (x) => { saved3.push(x); return true; } });
  const f3 = look(c3);
  const n3 = RL.blockFrom(big.table).length;
  ok(!f3.fit.hidden && f3.fit.dataset.state === 'over' && f3.fit.textContent === `超出 1 500 字符（${n3}）——去掉几行或缩短后再保存` && f3.save.disabled, `§S the card counts what 保存 would write (${n3}) — 「超出 1 500 字符（${n3}）——去掉几行或缩短后再保存」, 保存 disabled`, { text: f3.fit.textContent, disabled: f3.save.disabled });
  f3.save.onclick();
  ok(saved3.length === 0, '§S …a press while over writes NOTHING (never a slice)');
  const ticks = c3.querySelectorAll('.learn-tick');
  for (let i = 2; i < 12; i++) { ticks[i].checked = false; ticks[i].onchange(); }
  const n3b = Number((/（(\d+)）/.exec(f3.fit.textContent) || [])[1]);
  ok(!f3.fit.hidden && f3.save.disabled && n3b > M.USER_BLOCK_MAX && n3b < n3, `§S …unticking 10 of the 12 new lines is not yet enough: the count follows every tick (${n3} → ${n3b})`, f3.fit.textContent);
  ticks[1].checked = false; ticks[1].onchange();
  ok(f3.fit.hidden && !f3.save.disabled, '§S …the 11th untick brings it under: the notice goes, 保存 is pressable', f3.fit.textContent);
  f3.save.onclick();
  ok(saved3.length === 1 && own.every((l) => saved3[0].split('\n').includes(l)) && saved3[0].length <= M.USER_BLOCK_MAX, `§S …保存 then writes the new line + ALL 11 kept lines (${saved3[0] ? saved3[0].length : 0} chars) — nothing cut`, saved3[0] && saved3[0].length);
  // the box typed past the bound ⇒ the same count
  const c3b = LC.renderLearnCard(answerOf('Invoices', { lines: [{ text: 'Invoices', kind: 'keep', line: 1, from: [] }], removed: [], note: '' }), {});
  const box = c3b.querySelector('.learn-text'); box.value = 'x'.repeat(1600); box.oninput();
  ok(look(c3b).fit.dataset.state === 'over' && look(c3b).save.disabled, 'an edit typed past 1 500 in a row\'s box ⇒ the same notice, 保存 waits');
  // F2: an empty save is SAID — 「保存后这一段为空」 + 「清空并保存」
  const c4 = LC.renderLearnCard(answerOf('Invoices matter', { lines: [], removed: [{ line: 1, reason: 'never needed you' }], note: '' }), {});
  ok(!look(c4).fit.hidden && look(c4).fit.textContent === '保存后这一段为空' && look(c4).save.textContent === '清空并保存' && !look(c4).save.disabled, 'a named removal of the only line ⇒ the card says 「保存后这一段为空」 and the button reads 「清空并保存」', [look(c4).fit.textContent, look(c4).save.textContent]);
  const c5 = LC.renderLearnCard(answerOf('Invoices matter', { lines: [{ text: 'Invoices matter', kind: 'keep', line: 1, from: [] }], removed: [], note: '' }), {});
  const t5 = c5.querySelector('.learn-tick'); t5.checked = false; t5.onchange();
  ok(look(c5).fit.textContent === '保存后这一段为空' && look(c5).save.textContent === '清空并保存', 'the person unticks every row ⇒ the same words before an empty Save');
  // the door refuses (an over-length value reached it anyway): the card stays, nothing else happens
  const c6 = LC.renderLearnCard(answerOf('Invoices matter', { lines: [{ text: 'Invoices matter', kind: 'keep', line: 1, from: [] }], removed: [], note: '' }), { onSave: () => false });
  DOC_BODY.appendChild(c6); look(c6).save.onclick();
  ok(c6.isConnected, 'onSave answering false (the door refused it by name) ⇒ the card stays');
  c6.remove();
  // L5: refusals — every why a sentence in a toast; a 500 never raw: 「没有起草——服务端出错」 + the text under ONE closed fold
  const wrap = new El('div'); DOC_BODY.appendChild(wrap);
  const catalogue = new El('button'); wrap.appendChild(catalogue);
  const answers = [{ ok: false, why: 'busy' }, { ok: false, why: 'redirect' }, { ok: false, why: 'no-answer' }, { error: "Cannot read properties of undefined (reading 'textModel')" }, { ok: false, why: 'never-heard-of' }];
  let k = 0;
  globalThis.__fetchJson = async (url, o) => (o && o.method === 'POST' ? answers[k++] : { ok: true, exists: true, label: 'Gemini 3.8 Flash' });
  await LC.mountLearnDraft(wrap, { catalogue, ta: { value: '' }, apply: () => ({ ok: true }) });
  const b = wrap.querySelector('[data-draft]');
  const seen = [];
  for (const _ of answers) { globalThis.__toasts = []; await b.onclick(); const rc = wrap.querySelector('[data-learn-refused]'); seen.push({ toast: globalThis.__toasts.map((x) => x[0]).join(), card: rc ? rc.querySelector('.learn-card-head').textContent : null, fold: rc ? rc.querySelectorAll('details').map((d) => [d.dataset.fold, d.open === true, d.textContent]) : null, btn: [b.disabled, b.textContent] }); }
  ok(seen[0].toast === '没有起草——已有一次起草在进行——等它完成' && /跳转/.test(seen[1].toast) && /没有回应/.test(seen[2].toast) && seen.slice(0, 3).every((s) => !s.card && s.btn[0] === false && s.btn[1] === '从我的判定起草'), 'busy / redirect / no-answer ⇒ a toast in the owner\'s words; the button is pressable again (it follows the answer)', seen.slice(0, 3));
  const raw = (s) => [s.toast, s.card].join(' ');
  ok(seen.slice(3).every((s) => s.toast === '' && s.card === '没有起草——服务端出错' && s.fold.length === 1 && s.fold[0][0] === 'tech' && s.fold[0][1] === false && !/Cannot read|never-heard-of/.test(raw(s))) && /reading 'textModel'/.test(seen[3].fold[0][2]) && /never-heard-of/.test(seen[4].fold[0][2]), 'a 500\'s message and a why without words ⇒ 「没有起草——服务端出错」, the raw text ONLY under ONE closed 技术细节 fold — never in the toast', seen.slice(3));
  wrap.remove();

  // lane rule-learning-fix-r2 F4: the cut row — 「太长——已截短」, NOT ticked, no marker in its box, its whole text only under
  // its OWN closed 技术细节 fold; the default 保存 writes the person's lines
  const E170c = wordsOf(170, 'contract'), L152c = wordsOf(152), BLK2 = `${L152c}\nForum digests never matter`;
  const savedF4 = [];
  const c7 = LC.renderLearnCard(answerOf(BLK2, { lines: [{ text: L152c, kind: 'keep', line: 1, from: [] }, { text: E170c, kind: 'edit', line: 2, from: [1], evidence: 'one contract waited' }], removed: [], note: '' }), { onSave: (x) => { savedF4.push(x); return true; } });
  const r7 = c7.querySelectorAll('.learn-row')[1], fold7 = r7.querySelectorAll('details'), box7 = r7.querySelector('.learn-text');
  ok(r7.dataset.long === '1' && r7.querySelector('.learn-long').textContent === '太长——已截短' && !r7.querySelector('.learn-tick').checked && !/omitted|…\[/.test(box7.value) && box7.value.length <= 120 && E170c.startsWith(box7.value) && fold7.length === 1 && fold7[0].dataset.fold === 'tech' && !fold7[0].open && fold7[0].textContent === '技术细节' + E170c,
    "F4 the 170-char edit: 「太长——已截短」, NOT ticked, its box cut at a word boundary without a marker, the model's whole text only under the row's own closed 技术细节 fold", { chip: (r7.querySelector('.learn-long') || {}).textContent, tick: r7.querySelector('.learn-tick').checked, box: box7.value, folds: fold7.length });
  look(c7).save.onclick();
  ok(savedF4[0] === BLK2, "F4 …the default 保存 writes the person's two lines (the line the cut edit rewords stays) — never the cut text, never a marker", savedF4);
  // F5: ONE header per kind — 「提议删掉的行」 over the named removals only, 「保留的原文」 over the person's lines that stay
  const heads = (card) => card.querySelectorAll('.learn-removed-head').map((h) => [h.textContent, h.dataset.list]);
  const listOps = (card) => card.querySelectorAll('.learn-removed').map((l) => [l.dataset.list, l.children.map((r) => r.dataset.op)]);
  const ONLY_UNMENTIONED = ['Invoices matter\nMy manager\nForum digests', { lines: [{ text: 'Anything legal', kind: 'add', line: null, from: [1], evidence: 'one contract' }], removed: [], note: '' }];
  const H1 = LC.renderLearnCard(answerOf(...ONLY_UNMENTIONED), {});
  const H2 = LC.renderLearnCard(answerOf(L152c, { lines: [{ text: 'Invoices this week', kind: 'edit', line: 1, from: [] }], removed: [], note: '' }), {});
  const H3 = LC.renderLearnCard(answerOf('Invoices matter\nForum digests\nLunch polls', { lines: [{ text: 'Invoices matter', kind: 'keep', line: 1, from: [] }], removed: [{ line: 2, reason: 'you marked digests not needed' }], note: '' }), {});
  ok(eq(heads(H1), [['保留的原文', 'kept']]) && eq(listOps(H1), [['kept', ['unmentioned', 'unmentioned', 'unmentioned']]]) && eq(heads(H2), [['保留的原文', 'kept']]) && eq(listOps(H2), [['kept', ['unproven']]])
    && eq(heads(H3), [['提议删掉的行', 'remove'], ['保留的原文', 'kept']]) && eq(listOps(H3), [['remove', ['remove']], ['kept', ['unmentioned']]]),
    'F5 ONE header per kind: 3 unmentioned lines ⇒ only 「保留的原文」; an unproven line ⇒ only 「保留的原文」; a named removal + an unmentioned line ⇒ 「提议删掉的行」 over the removal ONLY, 「保留的原文」 over the line that stays', { H1: heads(H1), H2: heads(H2), H3: [heads(H3), listOps(H3)] });
  const CARD_SRC = fs.readFileSync(path.join(repo, 'src/lib/learn-card.js'), 'utf8');
  const HEAD_NEW = "  for (const [named, head] of [[true, t('Lines it would remove')], [false, t('Your lines it keeps')]]) {\n    const xs = table.removed.filter((x) => (x.op === 'remove') === named);";
  const HEAD_OLD = "  for (const [named, head] of [[true, t('Lines it would remove')]]) {\n    const xs = table.removed;";
  const oldCard = CARD_SRC.includes(HEAD_NEW) ? await bundleCard(CARD_SRC.replace(HEAD_NEW, () => HEAD_OLD), 'f5') : null;
  const O1 = oldCard && oldCard.renderLearnCard(answerOf(...ONLY_UNMENTIONED), {});
  ok(O1 && eq(heads(O1).map((h) => h[0]), ['提议删掉的行']) && listOps(O1)[0][1].every((op) => op === 'unmentioned'), "RED CONTROL (F5): the old card — one header over every line that leaves the proposal ⇒ 「提议删掉的行」 over 3 lines that all STAY (verify r2's §R2-G6)", O1 && heads(O1));
  // F6: a block STORED over 1 500 is said at the top, its tail kept as rows; the count is over and 保存 waits
  const c8 = LC.renderLearnCard(answerOf(STORED, { lines: [{ text: 'stored rule 1', kind: 'keep', line: 1, from: [] }], removed: [], note: '' }), {});
  const st8 = c8.querySelector('.learn-stored');
  ok(st8 && st8.dataset.state === 'over' && st8.textContent === `原文已超过 1 500 字符（${STORED.length}）——保存前要截掉 ${STORED.length - 1500} 字` && look(c8).fit.dataset.state === 'over' && look(c8).save.disabled && c8.querySelectorAll('.learn-old').length === 13,
    `F6 the block as stored (${STORED.length}) is SAID — 「${st8 && st8.textContent}」 — its 13 other lines are rows (the tail kept), the count is over and 保存 waits`, { stored: st8 && st8.textContent, fit: look(c8).fit.textContent });
  ok(!LC.renderLearnCard(answerOf('Invoices matter', { lines: [{ text: 'Invoices matter', kind: 'keep', line: 1, from: [] }], removed: [], note: '' }), {}).querySelector('.learn-stored'), 'F6 …a block within the bound draws no such line');
  // verify r2's G7: ticking a rewording that was not pre-ticked unticks the line it rewords — and that line says so
  const savedG7 = [];
  const c10 = LC.renderLearnCard(answerOf(L152c, { lines: [{ text: 'Invoices this week', kind: 'edit', line: 1, from: [] }], removed: [], note: '' }), { onSave: (x) => { savedG7.push(x); return true; } });
  const [tw, tk] = c10.querySelectorAll('.learn-tick');
  const kw = () => c10.querySelectorAll('.learn-removed')[0].querySelector('.learn-why').textContent;
  const before = [tw.checked, tk.checked, kw()];
  tw.checked = true; tw.onchange();
  const during = [tk.checked, kw()];
  tw.checked = false; tw.onchange();
  const back = [tk.checked, kw()];
  tw.checked = true; tw.onchange(); look(c10).save.onclick();
  ok(eq(before, [false, true, '上面的改写无依据——这一行保留']) && eq(during, [false, '已由上面的改写替换——要留原文就取消上面的勾']) && eq(back, [true, '上面的改写无依据——这一行保留']) && eq(savedG7, ['Invoices this week']),
    'G7 ticking the unproven rewording unticks the line it rewords, that row saying 「已由上面的改写替换——要留原文就取消上面的勾」; unticking gives the line back; 保存 then writes the rewording alone', { before, during, back, savedG7 });

  // lane learn-card-untick (verify r3) — R3-F1: ONE rule for every rewording on the card. A PRE-TICKED rewording unticked ⇒
  // its line comes back and 保存 writes it (verify r3's probe-untick-edit); both rows say which, in both states
  const BL2 = 'Invoices due this week matter to me\nForum digests do not', L1 = 'Invoices due this week matter to me';
  const sup2 = { lines: [{ text: 'Invoices this week, and contracts', kind: 'edit', line: 1, from: [1], evidence: 'invoice 7' }], removed: [], note: '' };
  const lineRow = (card) => card.querySelectorAll('.learn-removed').flatMap((l) => l.children).find((r) => r.querySelector('.learn-old').textContent === L1);
  const stateOf = (card) => { const rw = card.querySelector('.learn-rows').children[0], lr = lineRow(card); return { rw: rw.querySelector('.learn-tick').checked, state: (rw.querySelector('.learn-state') || {}).textContent || null, op: lr && lr.dataset.op, line: lr && lr.querySelector('.learn-tick').checked, why: lr && lr.querySelector('.learn-why').textContent }; };
  const flip = (tick, v) => { tick.checked = v; tick.onchange(); };
  const savedU = [];
  const c11 = LC.renderLearnCard(answerOf(BL2, sup2), { onSave: (x) => { savedU.push(x); return true; } });
  const u0 = stateOf(c11);
  flip(c11.querySelector('.learn-tick'), false);
  const u1 = stateOf(c11);
  look(c11).save.onclick();
  ok(eq(u0, { rw: true, state: '已勾选：这一行将被改写', op: 'replaced', line: false, why: '已由上面的改写替换——要留原文就取消上面的勾' }) && eq(u1, { rw: false, state: '未勾选：原文不会被改写', op: 'replaced', line: true, why: '上面的改写未勾选——这一行保留' }) && eq(savedU, [BL2]),
    'R3-F1 a PRE-TICKED rewording: its line has a row of its own under 保留的原文 (unticked, 「已由上面的改写替换——要留原文就取消上面的勾」) and the rewording says 「已勾选：这一行将被改写」; unticked ⇒ the line is ticked again (「上面的改写未勾选——这一行保留」 / 「未勾选：原文不会被改写」) and 保存 writes the person\'s line', { u0, u1, savedU });
  const words2 = ['unproven', 'shortened'].map((kind) => {
    const raw = { lines: [{ text: kind === 'unproven' ? 'Invoices this week, and contracts' : wordsOf(170, 'contract'), kind: 'edit', line: 1, from: kind === 'unproven' ? [] : [1], evidence: 'e' }], removed: [], note: '' };
    const cw = LC.renderLearnCard(answerOf(BL2, raw), {}), a = stateOf(cw);
    flip(cw.querySelector('.learn-tick'), true);
    return [a, stateOf(cw)];
  });
  ok(words2.every(([a, b]) => a.state === '未勾选：原文不会被改写' && a.line && b.state === '已勾选：这一行将被改写' && !b.line && b.why === '已由上面的改写替换——要留原文就取消上面的勾'), 'R3-F1 …the SAME words on an unproven and a cut rewording (unticked: 「未勾选：原文不会被改写」, the line ticked; ticked: 「已勾选：这一行将被改写」, the line unticked and said)', words2);
  const mR = mutant(C_NEW_R3, '  const claimed = new Set(rows.filter((r) => r.tick).map((r) => r.line).filter(Boolean));', 'r3f1-card');
  const savedR = [];
  const cR = LC.renderLearnCard({ ...answerOf(BL2, sup2), table: mR.diffTable(BL2, mR.normalizeProposal(sup2, { block: BL2, examples: EXN })) }, { onSave: (x) => { savedR.push(x); return true; } });
  flip(cR.querySelector('.learn-tick'), false); look(cR).save.onclick();
  ok(!lineRow(cR) && eq(savedR, ['Forum digests do not']) && look(cR).fit.hidden, 'RED CONTROL (R3-F1): the card over the OLD table — the pre-ticked rewording claimed its line ⇒ no row for it; unticking the rewording makes 保存 write «Forum digests do not», and nothing on the card says the line went', { savedR });
  // R3-F6: the person's own tick on the line outlives its rewording's ticks — an untick is never undone, a tick never taken
  const g6 = [];
  const c12 = LC.renderLearnCard(answerOf(BL2, { lines: [{ text: 'Invoices this week, and contracts', kind: 'edit', line: 1, from: [], evidence: '' }], removed: [], note: '' }), {});
  const t12 = () => [c12.querySelector('.learn-tick'), lineRow(c12).querySelector('.learn-tick')];
  flip(t12()[1], false); flip(t12()[0], true); flip(t12()[0], false); g6.push(stateOf(c12));
  const saved6 = [];
  const c13 = LC.renderLearnCard(answerOf(BL2, sup2), { onSave: (x) => { saved6.push(x); return true; } });
  const t13 = () => [c13.querySelector('.learn-tick'), lineRow(c13).querySelector('.learn-tick')];
  flip(t13()[1], true); g6.push(stateOf(c13)); flip(t13()[0], false); flip(t13()[0], true); g6.push(stateOf(c13)); look(c13).save.onclick();
  ok(eq(g6[0], { rw: false, state: '未勾选：原文不会被改写', op: 'unproven', line: false, why: '已取消勾选——这一行不会保存' })
    && eq(g6[1], { rw: true, state: '已勾选：与原文一起保存', op: 'replaced', line: true, why: '与上面的改写一起保留——两行都会保存' }) && eq(g6[2], g6[1]) && eq(saved6, ['Invoices this week, and contracts\n' + BL2]),
    'R3-F6 the person unticks their line, then ticks and unticks its rewording ⇒ the line stays unticked (「已取消勾选——这一行不会保存」); the person ticks their replaced line ⇒ both are kept (「与上面的改写一起保留——两行都会保存」 / 「已勾选：与原文一起保存」), and the rewording\'s ticks never take it again', g6);
  const FLIP_NEW = 'tick.onchange = () => { if (mem.mine === null) gTick.checked = !tick.checked; say(); recount(); };';
  const flipCard = CARD_SRC.includes(FLIP_NEW) ? await bundleCard(CARD_SRC.replace(FLIP_NEW, () => 'tick.onchange = () => { gTick.checked = !tick.checked; say(); recount(); };'), 'r3f6') : null;
  const c12m = flipCard && flipCard.renderLearnCard(answerOf(BL2, { lines: [{ text: 'Invoices this week, and contracts', kind: 'edit', line: 1, from: [], evidence: '' }], removed: [], note: '' }), {});
  const t12m = () => [c12m.querySelector('.learn-tick'), lineRow(c12m).querySelector('.learn-tick')];
  if (c12m) { flip(t12m()[1], false); flip(t12m()[0], true); flip(t12m()[0], false); }
  ok(c12m && t12m()[1].checked, 'RED CONTROL (R3-F6): the old flip — the rewording\'s untick re-ticks the line the person had unticked (verify r3 §G7(c))', c12m && stateOf(c12m));
  // R3-F5: the stored block's notice follows the count — it says what must STILL go and goes once 保存 fits (never «over»
  // beside an enabled 保存): a block over 1 500 only by CRLF + blank lines + indentation, and 14 stored lines unticked to fit
  const lines12 = Array.from({ length: 12 }, (_, i) => `rule ${String(i).padStart(2, '0')}: ${wordsOf(109)}`);
  const PAD = lines12.map((l) => `    ${l}`).join('\r\n\r\n');
  const savedP = [];
  const c14 = LC.renderLearnCard(answerOf(PAD, { lines: [], removed: [], note: '' }), { onSave: (x) => { savedP.push(x); return true; } });
  const st14 = c14.querySelector('.learn-stored');
  look(c14).save.onclick();
  ok(PAD.length > M.USER_BLOCK_MAX && st14 && st14.hidden && !look(c14).save.disabled && eq(savedP, [lines12.join('\n')]) && savedP[0].length <= M.USER_BLOCK_MAX, `R3-F5 a block stored at ${PAD.length} only because of CRLF / blank lines / indentation (保存 writes ${lines12.join('\n').length}): the notice is hidden while 保存 is pressable — never «over» beside it`, { stored: PAD.length, hidden: st14 && st14.hidden, text: st14 && st14.textContent });
  const c15 = LC.renderLearnCard(answerOf(STORED, { lines: [{ text: 'stored rule 1', kind: 'keep', line: 1, from: [] }], removed: [], note: '' }), {});
  const st15 = c15.querySelector('.learn-stored'), kt15 = c15.querySelectorAll('.learn-removed')[0].children.map((r) => r.querySelector('.learn-tick'));
  const n15 = [st15.textContent];
  flip(kt15[12], false); n15.push(st15.textContent, look(c15).fit.textContent);
  flip(kt15[11], false); flip(kt15[10], false); n15.push(st15.hidden, look(c15).save.disabled);
  const after1 = STORED.split('\n').slice(0, 13).join('\n').length;
  ok(n15[0] === `原文已超过 1 500 字符（${STORED.length}）——保存前要截掉 ${STORED.length - 1500} 字` && n15[1] === `原文已超过 1 500 字符（${STORED.length}）——保存前要截掉 ${after1 - 1500} 字` && n15[2] === `超出 1 500 字符（${after1}）——去掉几行或缩短后再保存` && n15[3] === true && n15[4] === false,
    `R3-F5 …a block stored at ${STORED.length}: the notice's amount follows every untick (${STORED.length - 1500} → ${after1 - 1500}, as the count says), and once 保存 fits the notice goes and 保存 is pressable`, n15);
  const ST_NEW = "      stored.hidden = !f.over; stored.dataset.state = f.over ? 'over' : 'fits';";
  const onceCard = CARD_SRC.includes(ST_NEW) ? await bundleCard(CARD_SRC.replace(ST_NEW, () => "      stored.dataset.state = 'over';").replace('{ chars: st.chars, n: f.chars - st.max }) : \'\';', () => "{ chars: st.chars, n: st.chars - st.max }) : t('The block as stored is already over 1,500 characters ({chars}) — {n} must go before it can be saved', { chars: st.chars, n: st.chars - st.max });"), 'r3f5') : null;
  const c14m = onceCard && onceCard.renderLearnCard(answerOf(PAD, { lines: [], removed: [], note: '' }), {});
  ok(c14m && !c14m.querySelector('.learn-stored').hidden && /保存前要截掉 \d+ 字/.test(c14m.querySelector('.learn-stored').textContent) && !look(c14m).save.disabled, 'RED CONTROL (R3-F5): the notice drawn once — 「…保存前要截掉 N 字」 beside a pressable 保存 that removes nothing (verify r3 §F6)', c14m && c14m.querySelector('.learn-stored').textContent);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
