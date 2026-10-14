#!/usr/bin/env node
// test-decision-inbox — FAST (lane inbox-decision-group: the Decision API's use ④, design-decision-api §2.6 row
// 「For-you 托盘分组」 + §2.10 ④; in-process, ZERO vendor calls). The For-you tray's two sections are the judge's SORT,
// never a new urgency:
//   ① PURE — the `inbox` plan (600 tokens / item, ONE item a call, ≤ 10 a pass, off the wake path, memo = use + item
//     id + level-table v), the never-list by construction (only text ≤ 400 + detail ≤ 800 + the conversation's name —
//     never the artifacts, the reply, the action / card, another item), eligibility, the verdict, both dialects;
//   ② THE PASS — the REAL decision engine + the REAL user-todos store over a fake fetch and a fake clock: the switch
//     off ⇒ 0 calls and the snapshot byte-identical to a store nobody attached; on ⇒ 13 eligible + 7 ineligible items
//     ⇒ 10 calls, then 3, then 0; every verdict lands as `judged` beside its item and NO urgency moves; journal rows
//     use 'inbox'; the day's counter counts them (the snapshot's `grouping.today`); a restart re-reads the memo (0
//     calls); a spent budget stops the pass after the call it had room for; the switch moving broadcasts once;
//   ③ OFF THE WAKE PATH — `inboxPass(` / `attachInbox(` have exactly their one caller each (the engine's own tick,
//     the wiring) and nothing under src/ reaches the pass from a wake / channel-message route;
//   ④ RED CONTROLS (scripts/mutant-copy.mjs): the reply text in the input ⇒ ① red; the pass without its cap ⇒ 13
//     calls (② red); a store that writes the verdict INTO urgency ⇒ ② red;
//   ⑤ A VERDICT IS KEYED BY THE TEXT IT JUDGED (inbox-verify F2): a re-file with new words / a reopen clears `judged`,
//     the memo material carries a digest of the cleaned text + detail ⇒ ONE new call with the new words, then 0; the
//     same words again answer from the memo (0 calls). RED: the base store (keeps `judged`) and the base memo (id only).
//   ⑥ INBOX v2 (lane decision-inbox-rank, decision-quality findings §二): the FACTS (PURE inboxFacts over the board's
//     record — blocked / continued / finished, the date table, re-asks) and their line (no id, no conversation or person
//     name), the three-way choice, THE DECAY on a fake clock, a blocked fact placing an item with no call, THE ORDER, the
//     five owner-measured item SHAPES end to end (judge stub → group / why / order), a facts change judged again, the
//     version bump re-scoring a v1 verdict, a stopped pass said (log + status), the re-ask count in the store.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DE = require(path.join(REPO, 'src/server/decision-engine.js'));
const M = require(path.join(REPO, 'src/decision-model.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('decision-inbox');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

const SECRET = { reply: 'REPLY-TEXT-NEVER-SENT', art: '/srv/never/artifact-plan.pdf', card: 'CARD-WORDS-NEVER-SENT', other: 'OTHER-ITEM-NEVER-SENT' };
/** Does a model's input for `item` keep the never-list? (the reply, the artifacts, the card, any other item) */
const neverKept = (Model, item) => {
  const parts = Model.inboxScoreInput(item);
  const text = Model.buildInput('inbox', parts).text;
  return { ok: Object.keys(parts).sort().join() === 'detail,facts,levels,session,text' && ![SECRET.reply, SECRET.art, SECRET.card, SECRET.other].some((s) => text.includes(s)), text };
};
const T0 = Date.UTC(2026, 9, 13, 12, 0);
const ITEM = { id: 'ut-a', status: 'open', urgency: 'normal', createdAt: T0 - 5 * 60e3, sessionName: 'Expense bot', text: 'Which expense process do I use for the Tokyo trip?', detail: 'The receipts are in the shared folder.',
  reply: { text: SECRET.reply }, artifacts: [{ kind: 'file', host: '', path: SECRET.art, name: 'artifact-plan.pdf' }], card: { title: SECRET.card }, others: [{ text: SECRET.other }] };

console.log('① PURE — the inbox plan, the never-list, eligibility, the verdict');
{
  const p = M.inputPlan('inbox');
  ok(p.ceiling === 600 && p.batch === 1 && p.perPass === 10 && p.wakePath === false, 'the plan: 600 tokens an item, ONE item a call, ≤ 10 a pass, not on a wake path', p);
  ok(M.USES.includes('inbox') && !M.USES.includes('foryou') && M.FEATURES.includes('inbox') && DE.FEATURE_OF.inbox === 'inbox', 'use ④ is `inbox` (the placeholder `foryou` is gone) with its OWN feature switch');
  ok(M.memoMaterial('inbox', { id: 'ut-a', digest: 'd1' }) === JSON.stringify(['inbox', 'ut-a', `v${M.INBOX.version}`, 'd1']) && M.memoMaterial('inbox', { id: 'ut-b', digest: 'd1' }) !== M.memoMaterial('inbox', { id: 'ut-a', digest: 'd1' }), 'the memo key = use + item id + level-table version + the input digest (a redraw / restart finds it)');
  const h = (s) => require('node:crypto').createHash('sha256').update(String(s)).digest('hex');
  const d0 = M.inboxMemoOf(ITEM, h), d1 = M.inboxMemoOf({ ...ITEM, detail: 'DEADLINE TODAY — the CFO waits' }, h);
  ok(d0.id === ITEM.id && /^[0-9a-f]{16}$/.test(d0.digest) && d1.digest !== d0.digest && M.inboxMemoOf({ ...ITEM, reply: { text: 'x' }, createdAt: 1 }, h).digest === d0.digest, 'F2: the digest = 16 hex of the cleaned text + detail — new words ⇒ a new key; a reply / a time ⇒ the same key', [d0, d1]);
  const nk = neverKept(M, { ...ITEM, reply: { text: SECRET.reply } });
  ok(nk.ok, 'the input carries ONLY the choices, the facts line, the item\'s words and the conversation\'s name — never its reply, artifacts, card or another item', nk.text);
  ok(nk.text.includes('Expense bot') && nk.text.includes('Tokyo trip') && nk.text.includes('shared folder'), 'the words that ARE sent: the text, the detail, the conversation name');
  const long = M.buildInput('inbox', M.inboxScoreInput({ ...ITEM, text: '报销'.repeat(400), detail: '流程说明。'.repeat(600), sessionName: 'x'.repeat(500) }));
  ok(long.est <= long.ceiling && long.ceiling === 600 && long.truncated, `a CJK-heavy item is cut to the ceiling (est ${long.est} ≤ 600, truncated)`);
  const cut = (v, max) => M.cleanPart(v, max).length <= max + 40;
  ok(cut('报销'.repeat(400), 400) && cut('流程说明。'.repeat(600), 800), 'text ≤ 400 / detail ≤ 800 characters (+ the elision marker)');
  ok(M.inboxLevelsText().length <= 600 && M.estTokens(M.inboxLevelsText()) <= M.PLANS.inbox.fixedCeiling, 'the choices text fits its fixed ceiling');
  const E = (o) => M.inboxEligible({ ...ITEM, reply: null, ...o }, T0);
  const table = [[{}, true], [{ urgency: undefined }, true], [{ urgency: 'high' }, 'urgency'], [{ urgency: 'urgent' }, 'urgency'], [{ urgency: 'low' }, 'urgency'], [{ options: ['A', 'B'] }, 'answers'], [{ action: { type: 'open-channel', key: 'k' } }, 'answers'],
    [{ reply: { text: 'x' } }, 'answered'], [{ createdAt: T0 - 30e3 }, 'young'], [{ judged: { group: 'now', v: M.INBOX.version } }, 'scored'], [{ judged: { group: 'now', v: 0 } }, true], [{ kind: 'notice' }, 'notice'], [{ status: 'done' }, 'not-open']];
  const bad = table.filter(([o, want]) => E(o) !== want);
  ok(!bad.length, `eligibility: open · normal · no options / buttons · no reply · ≥ 1 min · not scored under this table (${table.length} rows)`, bad.map(([o, w]) => [o, w, E(o)]));
  const v = (a) => M.inboxVerdict({ name: 'inbox_need', type: 'choice', ...a });
  ok(JSON.stringify(v({ choice: 'blocked', probabilities: { blocked: 0.83, dated: 0.1, whenever: 0.07 } })) === '{"group":"now","why":"blocked","p":0.83}' && v({ choice: 'dated', probabilities: { dated: 0.6 } }).group === 'now'
    && JSON.stringify(v({ choice: 'whenever', confidence: 0.9 })) === '{"group":"later","why":"whenever","p":0.9}' && v({ choice: 'now' }) === null && v({ refused: true, why: 'missing' }) === null,
    'the verdict (v2): blocked / dated ⇒ now, whenever ⇒ later; why = the chosen value, p = its probability (else the confidence); a foreign value or a refusal is no verdict');
  ok(M.INBOX.version === 2 && M.INBOX_QUESTION.type === 'choice' && M.INBOX_QUESTION.choices.map((c) => c.value).join() === 'blocked,dated,whenever', 'INBOX v2 asks ONE choice of three: blocked | dated | whenever');
  for (const prov of M.PROVIDERS) {
    const body = M.buildRequest(prov, { input: 'x', questions: [M.INBOX_QUESTION] });
    ok(!M.questionError(M.INBOX_QUESTION) && JSON.stringify(body).includes('inbox_need') && JSON.stringify(body).includes('whenever'), `${prov}: the choice question is valid and spelled by the dialect`);
  }
}

/** A world: the REAL engine + the REAL store over a fake fetch. `cents` = the daily budget; `inboxOn` = the switch. */
// the judge's request body is a ONE-SHOT stream (lane judge-one-shot-body) — a fake reads it like the wire does
const bodyText = (init) => (typeof init.body === 'string' ? init.body : new Response(init.body).text());
function world(name, { Engine = DE, Store = UserTodoManager, cents = 100, inboxOn = true, dataDir = null } = {}) {
  const dir = dataDir || path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const w = { fetches: 0, bodies: [], choices: [], warns: [], T: T0, cfg: { inbox: inboxOn, dailyBudgetCents: cents }, changes: 0, dir };
  const fakeFetch = async (url, init) => {
    w.fetches++;
    const b = JSON.parse(await bodyText(init)); w.bodies.push(b.input);
    const rec = b.input.split('———').pop();   // the item, not the choices text
    const choice = /deadline|invoice|22:00/i.test(rec) ? 'dated' : /expense|which|subnet|meeting/i.test(rec) ? 'blocked' : 'whenever';
    w.choices.push(choice);
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ answers: [{ type: 'choice', name: 'inbox_need', choice, probabilities: [{ value: choice, probability: 0.86 }, { value: choice === 'whenever' ? 'blocked' : 'whenever', probability: 0.14 }] }], usage: { input_tokens: 150 } }) };
  };
  w.eng = Engine.create({ dataDir: dir, fetchImpl: fakeFetch, now: () => w.T, tzOffset: () => 0, log: { ...quiet, warn: (m) => w.warns.push(String(m)) },
    integrations: { resolveIntegration: () => ({ values: { provider: 'openai', apiKey: 'sk-dummy-inbox', model: '' }, source: 'user' }) } });
  // int263 seam (a): plugin-settings-p0's engine reads the switches from the plugin's settings rows (h.settings via the
  // plugin's cfg), never plugins.json config — the plant is a settings plant
  w.eng.attachPlugin({ peek: () => ({ enabled: true }), settings: () => ({ ...w.cfg }) });
  // lane decision-inbox-clock: the store stamps on the engine's clock — a filing's createdAt and the pass's `now` agree
  w.store = new Store({ dataDir: dir, expirySweepMs: 0, now: () => w.T, onChange: () => { w.changes++; } });
  w.journal = () => { try { return fs.readFileSync(w.eng.files.journal, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return w;
}
/** 13 eligible items (5 about money / deadlines) + 7 that are not (high, urgent, options, a button, a reply, a notice, a young one). */
function seed(w) {
  const add = (o) => w.store.add(o.sk || 'claude:s1', { by: 'agent', origin: 'agent', sessionName: 'Ops agent', ...o });
  for (let k = 0; k < 13; k++) add({ text: k < 5 ? `Which expense process for trip ${k}?` : `Task ${k} finished — the report is in the folder.`, detail: k === 0 ? 'see the folder' : null, urgency: 'normal' });
  add({ text: 'Production is down', urgency: 'high' }); add({ text: 'Rotate the key', urgency: 'urgent' });
  add({ text: 'Pick a colour', urgency: 'normal', options: ['Red', 'Blue'] });
  add({ text: 'A reply came', urgency: 'normal' }); add({ text: 'Spend notice', urgency: 'normal', kind: 'notice' }); add({ text: 'A button', urgency: 'normal' }); add({ text: 'Filed just now', urgency: 'normal' });
  const old = w.T - 5 * 60e3;
  w.store.reshapeItems((it) => {
    it.createdAt = it.text === 'Filed just now' ? w.T - 20e3 : old;
    if (it.text === 'A reply came') it.reply = { text: SECRET.reply, at: old };
    if (it.text === 'A button') it.action = { type: 'open-channel', key: 'slack:c1' };
    if (it.text.startsWith('Task 5')) it.artifacts = [{ kind: 'file', host: '', path: SECRET.art, name: 'artifact-plan.pdf' }];
    return true;
  });
  return w.store.openItems().map((i) => [i.id, i.urgency]);
}

console.log('② THE PASS — the REAL engine + the REAL For-you store, a fake vendor');
{
  const off = world('off', { inboxOn: false });
  seed(off); off.store.flush();
  const bare = new UserTodoManager({ dataDir: off.dir, expirySweepMs: 0, now: () => off.T });
  const before = JSON.stringify(bare.snapshot());
  off.eng.attachInbox(off.store, { tickMs: 0 });
  const r0 = await off.eng.inboxPass();
  ok(!r0.ran && off.fetches === 0, 'the switch OFF ⇒ the pass does not run: 0 calls');
  ok(JSON.stringify(off.store.snapshot()) === before && !('grouping' in off.store.snapshot()), 'the switch OFF ⇒ the snapshot is byte-identical to a store the engine never attached (no `grouping` key)');
  bare.stop(); off.store.stop();

  const w = world('on');
  const urg0 = seed(w);
  w.eng.attachInbox(w.store, { tickMs: 0 });
  const r1 = await w.eng.inboxPass();
  ok(r1.ran && w.fetches === 10 && r1.judged === 10, `pass 1: 13 eligible ⇒ ${w.fetches} calls (≤ 10 a pass), ONE item a call`, r1);
  ok(w.bodies.every((b) => (b.match(/\[record\]/g) || []).length === 1), 'every call carries exactly one item');
  ok(!w.bodies.some((b) => [SECRET.reply, SECRET.art].some((s) => b.includes(s))), 'no call carried a reply or an artifact path (the never-list on the wire)');
  const r2 = await w.eng.inboxPass(); const r3 = await w.eng.inboxPass();
  ok(w.fetches === 13 && r2.judged === 3 && r3.judged === 0, `pass 2 ⇒ the 3 left, pass 3 ⇒ 0 (every item scored once under table v${M.INBOX.version})`, { fetches: w.fetches, r2, r3 });
  const items = w.store.openItems();
  const judged = items.filter((i) => i.judged && i.judged.v);
  ok(judged.length === 13 && judged.every((i) => ['now', 'later'].includes(i.judged.group) && i.judged.v === M.INBOX.version && typeof i.judged.p === 'number' && ['blocked', 'whenever'].includes(i.judged.why)
    && i.judged.facts && i.judged.facts.state === 'unknown' && i.judged.sig === M.inboxFactsSig(i.judged.facts)), 'each verdict lives BESIDE its item: judged {group, why, p, at, v, facts, sig}', judged[0] && judged[0].judged);
  const young = items.find((i) => i.text === 'Filed just now');
  ok(young.judged && young.judged.v === 0 && young.judged.group === null && young.judged.facts && items.filter((i) => i.judged && i.judged.facts).length === 14, 'the FACTS are free: every sortable item carries them (13 judged + the young one\'s stand-in {group: null, v: 0}), the 6 others none');
  ok(judged.filter((i) => i.judged.group === 'now').length === 5, 'the money / deadline asks went to `now` (5), the finished reports to `later` (8)');
  ok(JSON.stringify(items.map((i) => [i.id, i.urgency])) === JSON.stringify(urg0), 'NO urgency moved — the judge sorts, it never re-urgences (every item\'s stored urgency byte-equal)');
  const inel = items.filter((i) => !(i.judged && i.judged.v)).map((i) => i.text).sort();
  ok(JSON.stringify(inel) === JSON.stringify(['A button', 'A reply came', 'Filed just now', 'Pick a colour', 'Production is down', 'Rotate the key', 'Spend notice']), 'the 7 ineligible were never sent', inel);
  const j = w.journal().filter((r) => r.outcome === 'ok');
  ok(j.length === 13 && j.every((r) => r.use === 'inbox' && r.n === 1), 'the journal: 13 rows, use = inbox, one item each');
  const g = w.store.snapshot().grouping;
  ok(g && g.on === true && g.today === 13 && w.eng.status().today.byUse.inbox.calls === 13, 'the day\'s counter counts the inbox use; the snapshot\'s grouping.today says 13', g);
  const c0 = w.changes;
  w.cfg.inbox = false; w.eng.inboxSwitched(); w.eng.inboxSwitched();
  ok(w.changes === c0 + 1 && !('grouping' in w.store.snapshot()), 'the switch moving ⇒ ONE broadcast, and the snapshot drops `grouping` (the tray draws today\'s layout)');
  w.cfg.inbox = true; w.eng.inboxSwitched();
  w.store.flush(); w.store.stop();

  // a restart: a new engine + store on the same data dir; an item whose verdict was lost is re-judged from the memo
  const w2 = world('on-restart', { dataDir: w.dir });
  const lost = w2.store.openItems().find((i) => i.judged).id;
  w2.store.reshapeItems((it) => { if (it.id !== lost) return false; delete it.judged; return true; });
  w2.eng.attachInbox(w2.store, { tickMs: 0 });
  await w2.eng.inboxPass();
  ok(w2.fetches === 0 && w2.store.get(lost).judged, 'a restart re-reads the memo: the lost verdict is back with 0 calls');
  w2.store.stop();

  // the budget: room for ONE call ⇒ one item judged, the refusal stops the pass
  const est = M.buildInput('inbox', M.inboxScoreInput({ text: 'Which expense process for trip 0?', detail: 'see the folder', sessionName: 'Ops agent', createdAt: T0 - 5 * 60e3 }, { state: 'unknown', reasks: 0, askedAt: T0 - 5 * 60e3 }, T0)).est + M.questionTokens([M.INBOX_QUESTION]);
  const w3 = world('budget', { cents: est * M.rateOf(null, M.PRICE_PER_MTOK_USD.openai) * 1.5 * 100 });
  seed(w3); w3.eng.attachInbox(w3.store, { tickMs: 0 });
  const rb = await w3.eng.inboxPass();
  const refused = w3.journal().filter((r) => r.outcome === 'refused');
  ok(w3.fetches === 1 && rb.judged === 1 && refused.length === 1 && refused[0].use === 'inbox' && refused[0].why === 'daily-budget', 'a spent budget: the call it had room for flies, the next is refused (daily-budget) and the pass stops — through the ONE caller\'s reserve / settle', { fetches: w3.fetches, rb, refused });
  const st = w3.eng.status().inbox;
  ok(rb.stopped === 'daily-budget' && st && st.stopped === 'daily-budget' && st.judged === 1 && w3.warns.filter((m) => /For-you pass stopped after 1 judged: daily-budget/.test(m)).length === 1, 'a stopped pass is SAID: status().inbox {judged, stopped} (the plugin\'s status carries it) + ONE log line', { st, warns: w3.warns });
  await w3.eng.inboxPass();
  ok(w3.warns.filter((m) => /For-you pass stopped/.test(m)).length === 1, '…and the same reason again is not said twice (the line names a change)', w3.warns);
  w3.store.stop();
}

console.log('③ OFF THE WAKE PATH — the pass has its own tick and nothing else');
{
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(c|m)?js$/.test(e.name)) files.push(p); } };
  walk(path.join(REPO, 'src'));
  const sites = (re) => files.flatMap((f) => (fs.readFileSync(f, 'utf8').match(re) || []).map(() => path.relative(REPO, f)));
  const pass = sites(/\binboxPass\(/g), attach = sites(/\battachInbox\(/g);
  ok(JSON.stringify([...new Set(pass)]) === '["src/server/decision-engine.js"]', 'inboxPass( is spelled only inside the engine (its own tick) — no route, no wake, no channel-message reaches it', pass);
  ok(attach.filter((f) => f !== 'src/server/decision-engine.js').join() === 'src/server/mounts-plugins-wiring.js', 'attachInbox( outside the engine = the ONE wiring line', attach);
  const eng = fs.readFileSync(path.join(REPO, 'src/server/decision-engine.js'), 'utf8');
  ok(!/require\([^)]*(spend|wake|billed|turn)/i.test(eng) && !/\b(billedWake|wakeSession|SPEND_REASONS\.)/.test(eng.replace(/^\s*(\*|\/\/).*$/gm, '')), 'the engine requires no wake / spend / turn module and calls no wake (a judgment opens no turn)');
}

console.log('④ RED CONTROLS — scratch copies with ONE named edit');
{
  const MUT = mutantCopies('decision-inbox', REPO);
  const mSrc = fs.readFileSync(path.join(REPO, 'src/decision-model.js'), 'utf8');
  const a1 = "detail: str(item && item.detail), session:";
  ok(mSrc.split(a1).length === 2, 'ANCHOR: the input\'s detail part');
  const Leaky = MUT.load('src/decision-model.js', mSrc.replace(a1, "detail: str(item && item.detail) + ' ' + str(item && item.reply && item.reply.text), session:"), 'reply-leak');
  ok(!neverKept(Leaky, ITEM).ok, 'CONTROL: the reply text appended to the detail ⇒ the never-list check is RED');
  const eSrc = fs.readFileSync(path.join(REPO, 'src/server/decision-engine.js'), 'utf8');
  const a2 = 'for (const [it, f] of due.slice(0, max)) {';
  ok(eSrc.split(a2).length === 2, 'ANCHOR: the pass\'s cap');
  const NoCap = MUT.load('src/server/decision-engine.js', eSrc.replace(a2, 'for (const [it, f] of due) {'), 'no-cap');
  const w = world('ctl-cap', { Engine: NoCap });
  seed(w); w.eng.attachInbox(w.store, { tickMs: 0 });
  await w.eng.inboxPass();
  ok(w.fetches === 13, `CONTROL: the pass without its cap ⇒ ${w.fetches} calls in one pass — ② would be red`);
  w.store.stop();
  const sSrc = fs.readFileSync(path.join(REPO, 'src/user-todos.js'), 'utf8');
  const a3 = '    it.judged = { group, p, at: Number(judged.at) || this._now(), v: Number(judged.v) || 1 };\n';
  ok(sSrc.split(a3).length === 2, 'ANCHOR: the store writes the verdict beside the item');
  const { UserTodoManager: ReUrg } = MUT.load('src/user-todos.js', sSrc.replace(a3, a3 + "    if (group === 'now') it.urgency = 'high';\n"), 're-urgence');
  const w2 = world('ctl-urg', { Store: ReUrg });
  const u0 = seed(w2); w2.eng.attachInbox(w2.store, { tickMs: 0 });
  await w2.eng.inboxPass();
  ok(JSON.stringify(w2.store.openItems().map((i) => [i.id, i.urgency])) !== JSON.stringify(u0), 'CONTROL: a store that writes the verdict into urgency ⇒ the urgency check is RED');
  w2.store.stop();
}

console.log('⑤ A VERDICT IS KEYED BY THE TEXT IT JUDGED (inbox-verify F2) — re-file / reopen ⇒ judged again');
/** One item judged `later`, re-filed with an urgent detail, then resolved + re-filed with the same words, then
 *  reopened from the panel → what each step left. */
async function refileRun(name, opts = {}) {
  const w = world(name, opts);
  const sk = 'claude:rf', text = 'Task 9 finished — the report is in the folder.';
  const add = (o = {}) => w.store.add(sk, { by: 'agent', origin: 'agent', sessionName: 'Ops agent', text, urgency: 'normal', ...o });
  const id = add().id;
  w.T += 5 * 60e3; // the first pass comes 5 min after the filing (the store stamped it on this clock)
  w.eng.attachInbox(w.store, { tickMs: 0 });
  await w.eng.inboxPass();
  const o = { first: w.store.get(id).judged && w.store.get(id).judged.group, calls1: w.fetches };
  add({ detail: 'the CFO waits on this invoice today' });
  o.cleared = !w.store.get(id).judged;
  await w.eng.inboxPass(); await w.eng.inboxPass();
  o.second = w.store.get(id).judged && w.store.get(id).judged.group; o.calls2 = w.fetches;
  w.store.setStatus(id, 'done'); add({ detail: 'the CFO waits on this invoice today' });
  o.clearedRefile = !w.store.get(id).judged;
  w.T += 2 * 60e3; await w.eng.inboxPass();
  o.third = w.store.get(id).judged && w.store.get(id).judged.group; o.calls3 = w.fetches;
  w.store.setStatus(id, 'done'); w.store.setStatus(id, 'open');
  o.clearedReopen = !w.store.get(id).judged;
  w.store.stop();
  return o;
}
{
  const o = await refileRun('refile');
  ok(o.first === 'later' && o.calls1 === 1, 'the first filing: ONE call, judged later', o);
  ok(o.cleared, 'a re-file with new words (a new detail) clears `judged`', o);
  ok(o.second === 'now' && o.calls2 === 2, 'the next pass judges it again: ONE new call with the new words ⇒ now (and the pass after it: 0)', o);
  ok(o.clearedRefile && o.third === 'now' && o.calls3 === 2, 'a resolved item re-filed with the SAME words: judged cleared, the memo answers by the digest (0 calls)', o);
  ok(o.clearedReopen, 'a reopen from the panel (setStatus open) clears `judged`', o);
  const MUT = mutantCopies('decision-refile', REPO);
  const sSrc = fs.readFileSync(path.join(REPO, 'src/user-todos.js'), 'utf8');
  const a1 = "{ existing.detail = detail; delete existing.judged; changed = true; }";
  ok(sSrc.split(a1).length === 2, 'ANCHOR: the re-file clears the verdict');
  const { UserTodoManager: Keeps } = MUT.load('src/user-todos.js', sSrc.replace(a1, '{ existing.detail = detail; changed = true; }'), 'keeps-judged');
  const k = await refileRun('ctl-refile-store', { Store: Keeps });
  ok(!k.cleared && k.second === 'later' && k.calls2 === 1, 'CONTROL: the base store (a re-file keeps `judged`) ⇒ the old verdict stays, 0 new calls — the legs above are RED on it', k);
  const eSrc = fs.readFileSync(path.join(REPO, 'src/server/decision-engine.js'), 'utf8');
  const a2 = 'memo: M.inboxMemoOf(it, sha, f) });';
  ok(eSrc.split(a2).length === 2, 'ANCHOR: the pass keys the memo by the digest');
  const IdOnly = MUT.load('src/server/decision-engine.js', eSrc.replace(a2, 'memo: { id: it.id } });'), 'memo-id-only');
  const m = await refileRun('ctl-refile-memo', { Engine: IdOnly });
  ok(m.cleared && m.second === 'later' && m.calls2 === 1, 'CONTROL: the base memo key (item id only) ⇒ judged cleared but the memo answers the OLD verdict — RED', m);
}

console.log('⑥ INBOX v2 (lane decision-inbox-rank) — facts, the date table, the decay, a blocked fact, the order, the five shapes');
{
  const H = 3600e3, OFF = 420;                       // the hub in PT (Date#getTimezoneOffset = 420)
  const T = Date.UTC(2026, 9, 13, 18, 0);             // Tue 2026-10-13 11:00 PT
  const local = (ms) => (ms === null || ms === undefined ? null : new Date(ms - OFF * 60000).toISOString().slice(0, 16).replace('T', ' '));
  // THE DATE TABLE — the phrase (the text's own, ≤ 40 characters) and when it is due, in the hub's zone
  const DATES = [
    ['今晚 22:00 前给我答复', '今晚 22:00', '2026-10-13 22:00'], ['Please reply by Friday 5pm', 'by Friday 5pm', '2026-10-16 17:00'], ['截止 10/20', '截止 10/20', '2026-10-20 23:59'],
    ['2026-10-15 发版', '2026-10-15', '2026-10-15 23:59'], ['Ship at 22:00 PT tonight', '22:00 PT tonight', '2026-10-13 22:00'], ['明天上午', '明天', '2026-10-14 23:59'], ['下周一开会', '下周一', '2026-10-19 23:59'],
    ['周五之前', '周五', '2026-10-16 23:59'], ['EOD please', 'EOD', '2026-10-13 23:59'], ['call me at 3pm', '3pm', '2026-10-13 15:00'], ['月底前', '月底', '2026-10-31 23:59'], ['the deadline is unclear', 'deadline', null],
    ['Ask Alice by Friday', 'by Friday', '2026-10-16 23:59'], ['上周五 我们讨论过', null], ['by monitoring the load', null], ['1/2 of the budget', null], ['version 2.369.264', null], ['see src/1/2 file', null], ['at 12:00:01 the log said', null],
  ];
  const badD = DATES.filter(([text, phrase, due]) => { const d = M.datePhraseOf(text, T, OFF); return phrase === null ? d !== null : !d || d.phrase !== phrase || local(d.due) !== due; });
  ok(!badD.length, `the date table (${DATES.length} fixtures): ISO, 10/13, 22:00, 5pm, 今晚 / 明天 / 周五 / 下周一 / 月底 / 截止, by Friday, EOD — never 上周五, a fraction, a version, a path or a timestamp`, badD.map(([t]) => [t, M.datePhraseOf(t, T, OFF)]));

  // THE FACTS — the board's record of the item's conversation (vibespace-status record + history, the newest progress note)
  const ask = T - 3 * H;
  const item = { id: 'ut-f1', text: 'Which subnet should the NOC switch use?', createdAt: ask };
  const rec = (state, at, extra = {}) => ({ state, at, setBy: 'agent', reason: null, detail: null, ...extra });
  const B = (status, history = status ? [status] : [], progressAt = 0) => ({ status, history, progressAt });
  const FACTS = [
    ['blocked since before the ask', B(rec('blocked', ask - H)), 'blocked'],
    ['needs-input set 5 min after the ask', B(rec('needs-input', ask + 5 * 60e3)), 'blocked'],
    ['blocked 2 h after, its reason names the item', B(rec('blocked', ask + 2 * H, { reason: 'waiting: which subnet should the NOC switch use' })), 'blocked'],
    ['blocked 2 h after on something else', B(rec('blocked', ask + 2 * H, { reason: 'the build server is down' })), 'continued'],
    ['a blocked run that began before the ask (the reason changed later)', B(rec('needs-input', ask + 2 * H, { reason: 'other words' }), [rec('needs-input', ask - H), rec('needs-input', ask + 2 * H, { reason: 'other words' })]), 'blocked'],
    ['working set 5 min after the ask', B(rec('working', ask + 5 * 60e3)), 'continued'],
    ['done after the ask', B(rec('done', ask + H)), 'finished'],
    ['done BEFORE the ask, nothing since', B(rec('done', ask - H)), 'unknown'],
    ['a progress note 5 min after (the ask\'s own note)', B(null, [], ask + 5 * 60e3), 'unknown'],
    ['a progress note 20 min after', B(null, [], ask + 20 * 60e3), 'continued'],
    ['the OWNER set working after the ask (not the agent)', B({ ...rec('working', ask + H), setBy: 'user' }, [{ ...rec('working', ask + H), setBy: 'user' }]), 'unknown'],
    ['no board at all', null, 'unknown'],
  ];
  const badF = FACTS.filter(([, board, want]) => M.inboxFacts(item, { now: T, board, tzOffsetMin: OFF }).state !== want);
  ok(!badF.length, `the agent's state from the board (${FACTS.length} fixtures): blocked = this ask's block (before it, ≤ 10 min after, or named) · continued = a status / progress after it · finished = done since it`, badF.map(([n, b]) => [n, M.inboxFacts(item, { now: T, board: b, tzOffsetMin: OFF }).state]));
  const re = M.inboxFacts({ ...item, createdAt: T - 14 * 24 * H, reasks: 2, reaskedAt: T - 2 * H }, { now: T });
  ok(re.reasks === 2 && re.askedAt === T - 2 * H && !M.inboxStale(re, T), 'a re-ask: counted, and the decay restarts at the last ask (a 14-day-old item re-asked 2 h ago is not stale)', re);

  // THE FACTS LINE — counts, kinds, ages and a quoted date phrase; never an id, the conversation's or a person's name
  const named = { id: 'ut-9f3a2b7c1d', sessionKey: 'claude:5c0ffee0-1234', sessionName: 'Ops agent Zhang', text: 'Ask Alice to sign the PO by Friday 5pm', detail: 'Bob and Carol already signed.', createdAt: T - 3 * H, reasks: 2, reaskedAt: T - 40 * 60e3 };
  const nf = M.inboxFacts(named, { now: T, board: B(rec('working', T - 20 * 60e3)), tzOffsetMin: OFF });   // after the LAST ask (a re-ask moves it)
  const line = M.inboxFactsLine(named, nf, T);
  ok(line === 'asked 3 h ago · the agent continued on a default · a date or time is named: "by Friday 5pm" · the item was re-asked 2 times, last 40 min ago', 'the facts line words the facts', line);
  ok(![named.id, named.sessionKey, '5c0ffee0', 'Ops agent', 'Zhang', 'Alice', 'Bob', 'Carol', 'sign'].some((x) => line.includes(x)), 'the facts-line census: no item id, no conversation key or name, no person\'s name, none of the item\'s other words', line);
  const sent = M.buildInput('inbox', M.inboxScoreInput(named, nf, T)).text;
  ok(/^facts: asked 3 h ago · /m.test(sent) && sent.indexOf('facts:') < sent.indexOf('text:'), 'the line goes FIRST in the record (the head survives a cut), through cleanPart like every part', sent);

  // THE DECAY — a fake clock (the function reads no clock of its own)
  const F = (o) => ({ state: 'unknown', dated: null, due: null, reasks: 0, askedAt: T - 47 * H, ...o });
  const DECAY = [[F({}), false], [F({ askedAt: T - 49 * H }), true], [F({ askedAt: T - 49 * H, state: 'continued' }), false], [F({ askedAt: T - 49 * H, state: 'finished' }), false],
    [F({ askedAt: T - 49 * H, state: 'blocked' }), true], [F({ askedAt: T - 49 * H, dated: '周五', due: T + 24 * H }), false], [F({ askedAt: T - 200 * H, dated: '10/10', due: T - 49 * H }), true],
    [F({ askedAt: T - 200 * H, dated: '10/12', due: T - 47 * H }), false], [F({ askedAt: T - 49 * H, dated: 'deadline', due: null }), true]];
  const badS = DECAY.filter(([f, want]) => M.inboxStale(f, T) !== want);
  ok(!badS.length, `THE DECAY (${DECAY.length} rows): 48 h since the last ask with no progress after it and no live date ⇒ stale — a stale blocked status too; a date still ahead (or < 48 h past) spares it`, badS);
  ok(M.inboxStale(F({ askedAt: T - 49 * H }), T - 2 * H) === false && M.inboxStale(F({ askedAt: T - 49 * H }), T) === true, 'the same facts on two clocks: 47 h ⇒ not yet, 49 h ⇒ stale (the engine and the tray hand `now` in)');

  // THE ORDER — PURE inboxRank
  const J = (why, o = {}) => ({ judged: { group: why === 'whenever' ? 'later' : 'now', why, p: 0.8, v: 2, facts: F({ askedAt: T - H }), ...o } });
  const I = (id, o) => ({ id, status: 'open', urgency: 'normal', createdAt: T - H, ...o });
  const pile = [
    I('l2', { createdAt: T - 3 * H, ...J('whenever', { facts: F({ askedAt: T - 3 * H }) }) }), I('pend', {}), I('r2', { judged: { group: 'now', p: 0.6, v: 1 } }), I('d2', J('dated', { facts: F({ askedAt: T - H, dated: '明天', due: T + 30 * H }) })),
    I('s', { createdAt: T - 49 * H, ...J('blocked', { facts: F({ askedAt: T - 49 * H }) }) }), I('b2', { createdAt: T - 2 * H, ...J('blocked', { facts: F({ askedAt: T - 2 * H }) }) }), I('o', { options: ['A', 'B'] }),
    I('dn', J('dated', { facts: F({ askedAt: T - H, dated: 'deadline', due: null }) })), I('h', { urgency: 'high' }), I('r1', { judged: { group: 'now', p: 0.9, v: 1 } }), I('l1', J('whenever')),
    I('b1', { createdAt: T - 5 * H, judged: { group: null, v: 0, facts: F({ askedAt: T - 5 * H, state: 'blocked' }) } }), I('d1', J('dated', { facts: F({ askedAt: T - H, dated: '今晚 22:00', due: T + 2 * H }) })), I('u', { urgency: 'urgent' }),
  ];
  const order = M.inboxRank(pile, T);
  ok(order.map((r) => r.id).join() === 'u,h,b1,b2,o,d1,d2,dn,r1,r2,pend,l1,l2,s', 'THE ORDER: 现在要你 = urgent › high › blocked (the oldest ask first) › decisions › dated (the nearest date first, an unknown one after) › the judge\'s p; then 待判断, then 可以等 newest first (the stale one last)', order.map((r) => `${r.id}:${r.section}/${r.why}`));
  ok(order.find((r) => r.id === 'b1').why === 'blocked' && order.find((r) => r.id === 'b1').section === 'now' && order.find((r) => r.id === 's').why === 'stale' && order.find((r) => r.id === 's').section === 'later',
    'a blocked FACT stands in 现在要你 with no verdict at all; the decay moves a judged-blocked item asked 49 h ago to 可以等 (why: stale)');

  // THE FIVE SHAPES (findings §二, by SHAPE only — the words are invented): the REAL engine + store, the board stubbed
  const w = world('v2-shapes');
  w.T = T;
  const shapes = [
    ['meeting', 'Which form should the meeting-room hub take: a mini PC or a stick?', 14 * 24 * H, B(rec('blocked', T - 14 * 24 * H + 60e3, { reason: 'waiting on the owner' }))],
    ['default', 'I started on the recommended defaults; veto any of the 7 decision points whenever you like.', 5 * H, B(rec('working', T - 4 * H), [rec('working', T - 4 * H)], T - 2 * H)],
    ['dated', 'Approve the purchase order before 22:00 PT tonight so the vendor ships tomorrow.', 3 * H, null],
    ['blocked', 'Which subnet should the new NOC switch use?', 2 * H, B(rec('needs-input', T - 2 * H + 30e3, { reason: 'the subnet question' }))],
    ['notice', 'Build finished; the report is in the shared folder.', 1 * H, B(rec('done', T - 0.5 * H))],
  ];
  const ids = {};
  for (const [k, text] of shapes) ids[k] = w.store.add('claude:' + k, { by: 'agent', origin: 'agent', sessionName: 'Agent ' + k, text, urgency: 'normal' }).id;
  w.store.reshapeItems((it) => { const sh = shapes.find(([k]) => ids[k] === it.id); if (!sh) return false; it.createdAt = T - sh[2]; return true; });
  const boardOf = new Map(shapes.map(([k, , , b]) => ['claude:' + k, b]));
  w.eng.attachInbox(w.store, { tickMs: 0, board: () => (key) => boardOf.get(key) || null });
  const r1 = await w.eng.inboxPass();
  const sentKinds = w.bodies.map((b) => (shapes.find(([, text]) => b.includes(text.slice(0, 30))) || ['?'])[0]).sort();
  ok(r1.judged === 3 && r1.placed === 2 && sentKinds.join() === 'dated,default,notice', 'the pass: the blocked fact and the 14-day-old stale ask are PLACED with no call (2); the other three are judged with their facts line (3 calls)', { r1, sentKinds });
  const placeOf = (k) => { const r = M.inboxRank(w.store.openItems(), T).find((x) => x.id === ids[k]); return `${r.section}/${r.why}`; };
  const got = Object.fromEntries(shapes.map(([k]) => [k, placeOf(k)]));
  ok(JSON.stringify(got) === JSON.stringify({ meeting: 'later/stale', default: 'later/whenever', dated: 'now/dated', blocked: 'now/blocked', notice: 'later/whenever' }), 'the five shapes: meeting-room (14 days, blocked status never refreshed) ⇒ 可以等 · stale; went-on-a-default ⇒ 可以等 · whenever; 22:00 PT ⇒ 现在要你 · dated; blocked ⇒ 现在要你 · blocked; a notice ⇒ 可以等', got);
  const rank = M.inboxRank(w.store.openItems(), T).map((r) => Object.keys(ids).find((k) => ids[k] === r.id));
  ok(rank.join() === 'blocked,dated,notice,default,meeting', 'their ORDER: blocked › dated in 现在要你; the notice (1 h), the default (5 h), then the stale ask in 可以等', rank);
  const factsLines = w.bodies.map((b) => (b.match(/^facts: (.*)$/m) || [, ''])[1]);
  ok(factsLines.length === 3 && factsLines.every((l) => /^asked \d+ (min|h|days) ago/.test(l) && !/Agent |claude:|ut-/.test(l)) && factsLines.some((l) => l.includes('a date or time is named: "22:00 PT tonight"')) && factsLines.some((l) => l.includes('the agent continued on a default')) && factsLines.some((l) => l.includes('the agent finished')),
    'what the vendor read: each call\'s facts line (the date phrase, continued, finished) — never the conversation\'s name or key', factsLines);
  const r2 = await w.eng.inboxPass();
  ok(r2.judged === 0 && w.fetches === 3 && w.changes > 0, 'the next pass: 0 calls, and no facts rewrite (they did not change)');
  const c0 = w.changes;
  await w.eng.inboxPass();
  ok(w.changes === c0, 'an idle pass writes nothing (no broadcast when no fact moved)', { c0, now: w.changes });
  // a facts change is judged again: the default's agent goes blocked on THIS ask (its reason names it) — placed, no call;
  // then the notice's agent reopens work (working after done) — the state moves finished → continued ⇒ ONE new call
  boardOf.set('claude:default', B(rec('blocked', T, { reason: 'waiting on: I started on the recommended defaults' })));
  boardOf.set('claude:notice', B(rec('working', T - 0.2 * H), [rec('done', T - 0.5 * H), rec('working', T - 0.2 * H)]));
  const r3 = await w.eng.inboxPass();
  ok(r3.judged === 1 && w.fetches === 4 && placeOf('default') === 'now/blocked', 'a facts change: the default\'s agent now blocked on THIS ask ⇒ 现在要你 with no call; the notice\'s finished → continued ⇒ judged again (ONE call)', { r3, fetches: w.fetches, d: placeOf('default') });
  w.store.stop();

  // THE VERSION BUMP: a verdict scored under v1 is scored once more under v2 (≈ one call per open item)
  const w1 = world('v2-bump');
  const id1 = w1.store.add('claude:v1', { by: 'agent', origin: 'agent', sessionName: 'Ops agent', text: 'Which expense process for the Tokyo trip?', urgency: 'normal' }).id;
  w1.store.reshapeItems((it) => { if (it.id !== id1) return false; it.createdAt = T0 - 5 * 60e3; it.judged = { group: 'now', p: 1, at: T0 - 60e3, v: 1 }; return true; });
  w1.eng.attachInbox(w1.store, { tickMs: 0 });
  ok(M.inboxEligible(w1.store.get(id1), T0) === true, 'a v1 verdict is not `scored` under v2');
  await w1.eng.inboxPass();
  const j1 = w1.store.get(id1).judged;
  ok(w1.fetches === 1 && j1.v === 2 && j1.why === 'blocked' && j1.group === 'now', 'the bump: ONE call re-scores the v1 item under v2 (why: blocked)', j1);
  w1.store.stop();

  // RE-ASKS in the store: the same agent filing the same words again (an OPEN item) is counted; new words are an edit;
  // a server producer's re-file is not an ask
  const ws = world('v2-reask');
  const t1 = 'Which region should the new bucket live in?';
  const a = ws.store.add('claude:ra', { by: 'agent', origin: 'agent', text: t1, urgency: 'normal' });
  ws.store.add('claude:ra', { by: 'agent', origin: 'agent', text: t1, urgency: 'normal' });
  const after2 = ws.store.get(a.id);
  ws.store.add('claude:ra', { by: 'agent', origin: 'agent', text: t1, detail: 'eu-west is cheaper', urgency: 'normal' });
  const after3 = ws.store.get(a.id);
  const lp = ws.store.add('login:x', { by: 'server', origin: 'login', text: 'The Claude login expired', urgency: 'normal' });
  ws.store.add('login:x', { by: 'server', origin: 'login', text: 'The Claude login expired', urgency: 'normal' });
  ok(after2.reasks === 1 && typeof after2.reaskedAt === 'number' && after3.reasks === 1 && !ws.store.get(lp.id).reasks, 'a re-ask is counted (1, with its time); a re-file with new words is an edit (still 1); a server producer\'s re-file is no ask (0)', { after2: after2.reasks, after3: after3.reasks, login: ws.store.get(lp.id).reasks });
  ws.store.setStatus(a.id, 'done'); ws.store.add('claude:ra', { by: 'agent', origin: 'agent', text: t1, urgency: 'normal' });
  ok(!ws.store.get(a.id).reasks && !ws.store.get(a.id).reaskedAt, 'a resolved item filed again is a NEW filing: no re-asks carried');
  ws.store.stop();

  // RED CONTROLS (scratch copies, ONE named edit each): the model without the decay / without the blocked fact
  const MUT6 = mutantCopies('decision-inbox-v2', REPO);
  const mSrc = fs.readFileSync(path.join(REPO, 'src/decision-model.js'), 'utf8');
  const aDecay = "  if (f && inboxStale(f, now)) return { ...base, why: 'stale' };\n", aFact = "  if (f && f.state === 'blocked') return { ...base, section: 'now', why: 'blocked', tier: 2 };\n";
  ok(mSrc.split(aDecay).length === 2 && mSrc.split(aFact).length === 2, 'ANCHORS: the two rules that overrule the judge');
  const meeting = { id: 'ut-m', status: 'open', urgency: 'normal', createdAt: T - 14 * 24 * H, judged: { group: 'now', why: 'blocked', p: 1, v: 2, facts: { state: 'blocked', dated: null, due: null, reasks: 0, askedAt: T - 14 * 24 * H } } };
  const NoDecay = MUT6.load('src/decision-model.js', mSrc.replace(aDecay, ''), 'no-decay');
  ok(M.inboxPlace(meeting, T).section === 'later' && NoDecay.inboxPlace(meeting, T).section === 'now', 'CONTROL: without the decay the 14-day-old meeting-room ask stands in 现在要你 again (the owner\'s complaint) — the shapes leg goes red on it');
  const fresh = { id: 'ut-b', status: 'open', urgency: 'normal', createdAt: T - H, judged: { group: null, v: 0, facts: { state: 'blocked', dated: null, due: null, reasks: 0, askedAt: T - H } } };
  const NoFact = MUT6.load('src/decision-model.js', mSrc.replace(aFact, ''), 'no-fact');
  ok(M.inboxPlace(fresh, T).section === 'now' && NoFact.inboxPlace(fresh, T).section === 'pending', 'CONTROL: without the blocked fact a blocked agent\'s ask waits for a judge in 待判断 — the order leg goes red on it');
}

console.log('⑦ ONE CLOCK (lane decision-inbox-clock) — the store reads only its injected clock, so ⑤ holds at any wall-clock time');
{
  const sSrc = fs.readFileSync(path.join(REPO, 'src/user-todos.js'), 'utf8');
  /** every wall-clock read in UserTodoManager's body but the constructor's default (`now = () => Date.now()`) */
  const bareClock = (src) => {
    const a = src.indexOf('class UserTodoManager {'), b = src.indexOf('\n}\n', a);
    return src.slice(a, b).split('\n').filter((l) => /\bDate\.now\b|new Date\(\)/.test(l) && !l.includes(', now = () => Date.now() }) {'));
  };
  const lines = bareClock(sSrc);
  ok(sSrc.includes('class UserTodoManager {') && lines.length === 0, 'CENSUS: no Date.now / new Date() in UserTodoManager but the constructor default', lines);
  const a4 = '        existing.createdAt = this._now();\n';
  ok(sSrc.split(a4).length === 2, 'ANCHOR: the re-file stamps createdAt on the store clock');
  const planted = sSrc.replace(a4, '        existing.createdAt = Date.now();\n');
  ok(bareClock(planted).length === 1, 'CONTROL: a planted Date.now() at the re-file ⇒ the census names it — RED', bareClock(planted));
  /** refileRun with the PROCESS clock (Date.now) moved to T0 + skew — the engine and the store run on w.T either way */
  const skewed = async (name, skew, opts) => {
    const real = Date.now, t0 = real();
    Date.now = () => T0 + skew + (real() - t0);
    try { return await refileRun(name, opts); } finally { Date.now = real; }
  };
  const ref = await refileRun('clock-ref');
  for (const [tag, skew] of [['T0 − 1 year', -365 * 864e5], ['T0 + 1 year', 365 * 864e5]]) {
    const r = await skewed('clock-' + (skew < 0 ? 'behind' : 'ahead'), skew);
    ok(r.third === 'now' && r.calls3 === 2 && JSON.stringify(r) === JSON.stringify(ref), `the process clock at ${tag}: ⑤ unchanged (the re-filed item judged by the digest, 0 calls)`, { r, ref });
  }
  const MUT = mutantCopies('decision-clock', REPO);
  const { UserTodoManager: WallClock } = MUT.load('src/user-todos.js', planted, 'wall-clock-refile');
  const wc = await skewed('ctl-clock-ahead', 365 * 864e5, { Store: WallClock });
  ok(wc.clearedRefile && !wc.third && wc.calls3 === 2, 'CONTROL: the base re-file stamp (Date.now) with the clock a year ahead ⇒ the re-filed item is young for ever, never judged — ⑤ RED', wc);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
