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
  return { ok: Object.keys(parts).sort().join() === 'detail,levels,session,text' && ![SECRET.reply, SECRET.art, SECRET.card, SECRET.other].some((s) => text.includes(s)), text };
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
  ok(nk.ok, 'the input carries ONLY the levels, the item\'s words and the conversation\'s name — never its reply, artifacts, card or another item', nk.text);
  ok(nk.text.includes('Expense bot') && nk.text.includes('Tokyo trip') && nk.text.includes('shared folder'), 'the words that ARE sent: the text, the detail, the conversation name');
  const long = M.buildInput('inbox', M.inboxScoreInput({ ...ITEM, text: '报销'.repeat(400), detail: '流程说明。'.repeat(600), sessionName: 'x'.repeat(500) }));
  ok(long.est <= long.ceiling && long.ceiling === 600 && long.truncated, `a CJK-heavy item is cut to the ceiling (est ${long.est} ≤ 600, truncated)`);
  const cut = (v, max) => M.cleanPart(v, max).length <= max + 40;
  ok(cut('报销'.repeat(400), 400) && cut('流程说明。'.repeat(600), 800), 'text ≤ 400 / detail ≤ 800 characters (+ the elision marker)');
  ok(M.inboxLevelsText().length <= 600 && M.estTokens(M.inboxLevelsText()) <= M.PLANS.inbox.fixedCeiling, 'the level table fits its fixed ceiling');
  const E = (o) => M.inboxEligible({ ...ITEM, reply: null, ...o }, T0);
  const table = [[{}, true], [{ urgency: undefined }, true], [{ urgency: 'high' }, 'urgency'], [{ urgency: 'urgent' }, 'urgency'], [{ urgency: 'low' }, 'urgency'], [{ options: ['A', 'B'] }, 'answers'], [{ action: { type: 'open-channel', key: 'k' } }, 'answers'],
    [{ reply: { text: 'x' } }, 'answered'], [{ createdAt: T0 - 30e3 }, 'young'], [{ judged: { group: 'now', v: M.INBOX.version } }, 'scored'], [{ judged: { group: 'now', v: 0 } }, true], [{ kind: 'notice' }, 'notice'], [{ status: 'done' }, 'not-open']];
  const bad = table.filter(([o, want]) => E(o) !== want);
  ok(!bad.length, `eligibility: open · normal · no options / buttons · no reply · ≥ 1 min · not scored under this table (${table.length} rows)`, bad.map(([o, w]) => [o, w, E(o)]));
  const v = (a) => M.inboxVerdict({ name: 'needs_now', type: 'score', ...a });
  ok(JSON.stringify(v({ score: 1, probabilities: { now: 0.83, later: 0.17 } })) === '{"group":"now","p":0.83}' && v({ score: 0, probabilities: { now: 0.2, later: 0.8 } }).group === 'later'
    && v({ score: 1 }).group === 'now' && v({ refused: true, why: 'missing' }) === null, 'the verdict: p(now) ≥ 0.5 ⇒ now, else later; a score without probabilities is its own p; a refusal is no verdict');
  for (const prov of M.PROVIDERS) {
    const body = M.buildRequest(prov, { input: 'x', questions: [M.INBOX_QUESTION] });
    ok(!M.questionError(M.INBOX_QUESTION) && JSON.stringify(body).includes('needs_now'), `${prov}: the score question is valid and spelled by the dialect`);
  }
}

/** A world: the REAL engine + the REAL store over a fake fetch. `cents` = the daily budget; `inboxOn` = the switch. */
function world(name, { Engine = DE, Store = UserTodoManager, cents = 100, inboxOn = true, dataDir = null } = {}) {
  const dir = dataDir || path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const w = { fetches: 0, bodies: [], T: T0, cfg: { inbox: inboxOn, dailyBudgetCents: cents }, changes: 0, dir };
  const fakeFetch = async (url, init) => {
    w.fetches++;
    const b = JSON.parse(init.body); w.bodies.push(b.input);
    const now = /expense|deadline|invoice/i.test(b.input.split('———').pop());   // the item, not the level table
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ answers: [{ type: 'score', name: 'needs_now', score: now ? 1 : 0, probabilities: [{ label: 'now', probability: now ? 0.86 : 0.12 }, { label: 'later', probability: now ? 0.14 : 0.88 }] }], usage: { input_tokens: 150 } }) };
  };
  w.eng = Engine.create({ dataDir: dir, fetchImpl: fakeFetch, now: () => w.T, tzOffset: () => 0, log: quiet,
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
  const judged = items.filter((i) => i.judged);
  ok(judged.length === 13 && judged.every((i) => ['now', 'later'].includes(i.judged.group) && i.judged.v === M.INBOX.version && typeof i.judged.p === 'number'), 'each verdict lives BESIDE its item: judged {group, p, at, v}');
  ok(judged.filter((i) => i.judged.group === 'now').length === 5, 'the money / deadline asks went to `now` (5), the finished reports to `later` (8)');
  ok(JSON.stringify(items.map((i) => [i.id, i.urgency])) === JSON.stringify(urg0), 'NO urgency moved — the judge sorts, it never re-urgences (every item\'s stored urgency byte-equal)');
  const inel = items.filter((i) => !i.judged).map((i) => i.text).sort();
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
  const est = M.buildInput('inbox', M.inboxScoreInput({ text: 'Which expense process for trip 0?', detail: 'see the folder', sessionName: 'Ops agent' })).est + M.questionTokens([M.INBOX_QUESTION]);
  const w3 = world('budget', { cents: est * M.rateOf(null, M.PRICE_PER_MTOK_USD.openai) * 1.5 * 100 });
  seed(w3); w3.eng.attachInbox(w3.store, { tickMs: 0 });
  const rb = await w3.eng.inboxPass();
  const refused = w3.journal().filter((r) => r.outcome === 'refused');
  ok(w3.fetches === 1 && rb.judged === 1 && refused.length === 1 && refused[0].use === 'inbox' && refused[0].why === 'daily-budget', 'a spent budget: the call it had room for flies, the next is refused (daily-budget) and the pass stops — through the ONE caller\'s reserve / settle', { fetches: w3.fetches, rb, refused });
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
  const a2 = '.filter((i) => M.inboxEligible(i, t) === true).slice(0, max);';
  ok(eSrc.split(a2).length === 2, 'ANCHOR: the pass\'s cap');
  const NoCap = MUT.load('src/server/decision-engine.js', eSrc.replace(a2, '.filter((i) => M.inboxEligible(i, t) === true);'), 'no-cap');
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
  add({ detail: 'DEADLINE TODAY — the CFO waits' });
  o.cleared = !w.store.get(id).judged;
  await w.eng.inboxPass(); await w.eng.inboxPass();
  o.second = w.store.get(id).judged && w.store.get(id).judged.group; o.calls2 = w.fetches;
  w.store.setStatus(id, 'done'); add({ detail: 'DEADLINE TODAY — the CFO waits' });
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
  const a2 = 'memo: M.inboxMemoOf(it, sha) });';
  ok(eSrc.split(a2).length === 2, 'ANCHOR: the pass keys the memo by the digest');
  const IdOnly = MUT.load('src/server/decision-engine.js', eSrc.replace(a2, 'memo: { id: it.id } });'), 'memo-id-only');
  const m = await refileRun('ctl-refile-memo', { Engine: IdOnly });
  ok(m.cleared && m.second === 'later' && m.calls2 === 1, 'CONTROL: the base memo key (item id only) ⇒ judged cleared but the memo answers the OLD verdict — RED', m);
}

console.log('⑥ ONE CLOCK (lane decision-inbox-clock) — the store reads only its injected clock, so ⑤ holds at any wall-clock time');
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
