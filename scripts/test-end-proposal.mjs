#!/usr/bin/env node
// test-end-proposal — lane login-request-card, majordomo piece 3b (the owner's addition, 2026-11-16: an agent that may NOT end a
// conversation can at least PROPOSE the end to the person on a card; 主开发 05:13Z: its second kind, a wake grant for jobs). FAST,
// in-process: the PURE rules (src/end-proposal.js), the verb row, THE STORE (src/server/end-proposals.js) over the REAL For-you store
// on scratch data with a fake list builder, a fake deliver (a wake would be counted) and a fake Terminate; the person-only door; the
// card's drawing (esbuild over a DOM shim); the words. 主开发's legs: a refused end followed by a proposal draws ONE card; a second
// proposal refreshes it; a row that turned busy between drawing and press is NOT ended (RED CONTROL: the press that trusts the
// drawn state); the answer reaches the proposer with no wake; a proposer naming conversations outside what it sees is refused by name.
// 主开发 18:26Z (the base: piece 7's taken 8867c2da9): the bound proposal door over piece 7's REAL jobs engine — one card per proposer
// and job, refreshed not multiplied; the approval is the person's press through the jobs wiring's own door; a plain agent's direct
// write stays refused by name and the refusal names the propose door (each with its red control); the page's one press (④b, ⑥).
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';   // the held store's red control (below) fails BY NAME when its anchor moves
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CK = checker();   // THE ONE assertion helper (scripts/lib/check.mjs, B-1747); its counts and its report
const ok = (c, name, info) => { if (typeof name !== 'string' || !name) throw new TypeError(`ok(cond, name): the name is ${typeof name} — the arguments are swapped`); return CK.ok(!!c, name, info); };   // the condition made boolean here, the swap refused
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const EP = require(path.join(REPO, 'src/end-proposal.js'));
const CF = require(path.join(REPO, 'src/conversation-facts.js'));
const AK = require(path.join(REPO, 'src/automation-keys.js'));
const FA = require(path.join(REPO, 'src/foryou-actions.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const IDLE = { state: 'running', turn: 'idle', background: [], heldPrompts: 0, asks: 0, goal: 'none', continue: { armed: false }, timers: 'none-seen', browser: null, handover: false, jobs: { running: 0, schedules: 0, items: [] } };   // piece 7's jobs fact: each owned job with its grant
const raw = (key, more = {}) => ({ key, id: 'sess-' + key.slice(-4), name: 'Conv ' + key.slice(-4), idleSince: Date.now() - 600000, memBytes: 314572800, ...IDLE, ...more });

console.log('① THE PURE RULES (src/end-proposal.js)');
{
  ok(JSON.stringify(EP.targetsOf('claude:a, claude:b claude:a').targets) === '["claude:a","claude:b"]' && JSON.stringify(EP.targetsOf(['claude:c']).targets) === '["claude:c"]', 'targets: a list or ONE string split on commas / blanks; duplicates folded');
  ok(EP.targetsOf('').code === 'bad_args' && EP.targetsOf(['x y']).code === 'bad_args' && EP.targetsOf(Array.from({ length: 21 }, (_, i) => `claude:${i}`)).code === 'bad_args', 'targets: none, a misshapen one, or more than 20 ⇒ refused by name');
  const idle = EP.drawnRow(CF.shapeRow(raw('claude:aaaa'))), busy = EP.drawnRow(CF.shapeRow(raw('claude:bbbb', { background: [{}, {}] })));
  ok(idle.pick === true && idle.busy.length === 0 && busy.pick === false && JSON.stringify(busy.busy) === '["background:2"]', 'the drawn row: nothing running ⇒ ticked; something running ⇒ NOT ticked, its reason with the count a person reads');
  const unk = EP.drawnRow(CF.shapeRow(raw('claude:cccc', { turn: null, turnWhy: 'a terminal conversation publishes no turn' })));
  ok(unk.pick === false && unk.busy.some((b) => /_unknown$/.test(b)), 'an UNKNOWN fact is busy: not ticked');
  const T = [
    [idle, raw('claude:aaaa'), 'end', 'idle then, idle now ⇒ end'],
    [idle, raw('claude:aaaa', { turn: 'running' }), 'changed', 'idle then, a turn running now ⇒ NOT ended (changed)'],
    [busy, raw('claude:bbbb', { background: [{}, {}] }), 'end', 'busy then and the SAME now ⇒ end (the person saw what is cut off)'],
    [busy, raw('claude:bbbb', { background: [{}, {}, {}] }), 'changed', 'two background tasks then, three now ⇒ NOT ended (changed)'],
    [idle, raw('claude:aaaa', { state: 'ended' }), 'ended', 'ended meanwhile ⇒ said, not an error'],
    [idle, null, 'gone', 'no row any more ⇒ gone'],
  ];
  for (const [d, now, want, name] of T) { const v = EP.pressVerdict(d, now && CF.shapeRow(now)); ok(v.verdict === want, `the press's judgement: ${name}`, v); }
  const words = EP.cutOffWords([{ code: 'turn' }, { code: 'background', n: 2 }, { code: 'timer_unknown' }, { code: 'held_unknown' }]);
  ok(words.length === 3 && words[0].key === 'A turn is running — it is cut off.' && words[1].params.n === 2 && words[2].key === EP.CUT_WORDS.unknown, 'what would be cut off, in the person\'s words (an unknown reason said once)', words);
  ok(/terminated: Conv aaaa \(claude:aaaa\)/.test(EP.answerText({ terminated: [{ key: 'claude:aaaa', name: 'Conv aaaa' }] })) && /not ended — something started/.test(EP.answerText({ changed: [{ key: 'claude:x', name: 'x' }] })), 'the proposer\'s answer names each row by name and key');
}

console.log('② THE VERB (one closed SCOPES row) and the CLI');
{
  const row = AK.SCOPES.find((s) => s.verb === 'conversations.propose');
  ok(row && row.billed === false && row.layer === 'act', 'conversations.propose: one row of the closed table, NOT billed');
  const a = row.args({ targets: 'claude:a,claude:b', why: 'both idle for a day' });
  ok(a.ok && JSON.stringify(a.args.targets) === '["claude:a","claude:b"]' && row.args({ targets: 'claude:a' }).code === 'bad_args' && row.args({ targets: 'claude:a', why: 'x', force: true }).code === 'bad_args', 'its args: the targets (a list), one sentence of why; no unknown field (no force)');
  const cli = read('data/bin/vibespace-api');
  ok(/'conversations propose': \{ verb: 'conversations\.propose', pos: \['targets'\], flags: \['why'\], need: \['why'\] \}/.test(cli), 'vibespace-api conversations propose <target>[,<target>…] --why "…"');
  const ref = CF.refusalOf(CF.endVerdict(CF.shapeRow(raw('claude:bbbb', { background: [{}] }))), { propose: true });
  ok(ref.code === 'subject_busy' && /propose it to the person: vibespace-api conversations propose <target> --why/.test(ref.why), 'THE DOOR: the end verb\'s refusal names the proposal (to a key that holds the verb)', ref.why);
}

// ── the store over the REAL For-you store ──
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-endprop-'));
process.on('exit', () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { } });
const GRANT_REFUSAL = require(path.join(REPO, 'src/delivery-wake.js')).GRANT_REFUSAL;
const loadMutated = (rel, mutate, requireOf = null) => { const file = path.join(REPO, rel); const m = { exports: {} }; const base = createRequire(file); new Function('module', 'exports', 'require', '__filename', '__dirname', mutate(read(rel)))(m, m.exports, requireOf ? (id) => requireOf(id, base) : base, file, path.dirname(file)); return m.exports; };
const world = (opts = {}, mutate = null) => {
  const dir = fs.mkdtempSync(path.join(scratch, 'w-'));
  const todos = new (opts.UserTodoManager || UserTodoManager)({ dataDir: dir, expirySweepMs: 3600e3 });
  const rows = new Map();
  const listFacts = { list: async () => ({ conversations: [...rows.values()].map((r) => CF.shapeRow(r)) }) };
  // a wake of any shape is COUNTED (the ladder's deliverToConversation, an ended addressee's parkEndedWake, a stash that asks to wake)
  const deliver = { stashed: [], wakes: 0, failStash: false, stashFor(cid, env) { if (this.failStash) return { stored: false }; if (env && (env.wake || /wake/i.test(String(env.kind || '')))) this.wakes++; this.stashed.push({ cid, ...env }); return { stored: true }; }, deliverToConversation() { this.wakes++; return { ok: true }; }, parkEndedWake() { this.wakes++; } };
  const ended = [];
  const endConversation = async (target, by) => { ended.push({ target, by }); if (opts.onEnd) await opts.onEnd(target, by); return opts.endResult ? opts.endResult(target) : { ok: true }; };
  const wrote = [];
  const owners = new Map(Object.entries(opts.owners || {}));   // jobId → the conversation key it wakes
  // THE ONE DOOR's shape (src/jobs.js changeWakeGrants through jobs-wiring setWakeGrants — lane lg-store-writes): ONE act for a list of
  // { id, grant } → { ok, code?, rows: [{ id, ok, changed, code?, error? }] }
  const setWs = opts.setWakeGrants || (async (changes, by) => { if (!by || (by.kind !== 'person' && by.kind !== 'key')) return { ok: false, code: 'wake_grant_person_only', error: GRANT_REFUSAL, rows: [] }; const rows = (changes || []).map((c) => { if (!owners.has(c.id)) return { id: c.id, ok: false, changed: false, code: 'not_found', error: 'no such job' }; wrote.push({ id: c.id, yes: c.grant === true, by }); return { id: c.id, ok: true, changed: true }; }); return { ok: rows.every((r) => r.ok), rows }; });
  let create = require(path.join(REPO, 'src/server/end-proposals.js')).create;
  if (mutate) create = loadMutated('src/server/end-proposals.js', mutate).create;
  const store = create({ userTodos: todos, deliver, listFacts, endConversation,
    liveKeys: () => [...rows.values()].filter((r) => r.key && r.state !== 'ended').map((r) => r.key),
    endedKeys: async () => [...rows.values()].filter((r) => r.key && r.state === 'ended').map((r) => r.key),   // THE FACT: a stopped record
    jobOwnerOf: (id) => (owners.has(id) ? { key: owners.get(id), cid: owners.get(id).slice(owners.get(id).indexOf(':') + 1) } : null),
    ...(opts.wake === false ? {} : { setWakeGrants: setWs, storeWakeTicks: async (ticks, by) => { const r = await setWs(ticks, by); if (!r || !r.ok) { const bad = (r && r.rows || []).find((x) => !x.ok) || r || {}; throw Object.assign(new Error(bad.error || bad.why || 'the ticks were not stored'), { code: bad.code || 'failed' }); } } }) });   // (the hub's storeWakeTicks, mounts-plugins-wiring — pinned below)
  return { todos, rows, owners, store, deliver, ended, wrote, stop: () => { try { todos.stop(); } catch { } } };
};
const CALLER = { conversationId: 'p0p0', sessionKey: 'claude:p0p0', name: 'Manager' };
const HUMAN = { kind: 'human', actBy: 'human:local' };
const reach = (o) => (o.conversationId === 'hidden01' ? { ok: false, code: 'not_granted' } : { ok: true });
const openProps = (w) => w.todos.idsWhere((i) => i && i.status === 'open' && EP.isProposal(i.action));
/** THE PRESS as the page sends it: the drawing it answers (the card's signature), then the answer. */
const press = (w, id, body = {}, by = HUMAN) => w.store.answer(id, { drawn: EP.cardSig(w.todos.get(id).card), ...body }, by);

console.log('③ THE STORE — one card per proposer (a second proposal ADDS); a row\'s identity cannot alias; the press judges each row again; the answer is free');
{
  const w = world();
  w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:bbbb', raw('claude:bbbb', { background: [{}, {}] })); w.rows.set('claude:hidden01', raw('claude:hidden01')); w.rows.set('claude:cccc', raw('claude:cccc'));
  const ref = CF.refusalOf(CF.endVerdict(CF.shapeRow(w.rows.get('claude:bbbb'))));
  const p1 = await w.store.propose({ targets: ['claude:aaaa', 'claude:bbbb'], why: 'both idle since yesterday; memory is short' }, { caller: CALLER, reach });
  const ids = openProps(w), it = ids.length ? w.todos.get(ids[0]) : null;
  ok(ref.code === 'subject_busy' && p1.ok && ids.length === 1 && it.sessionKey === 'claude:p0p0' && it.card.rows.length === 2 && it.card.rows[0].pick === true && it.card.rows[1].pick === false && it.action.kind === 'end',
    'A REFUSED END FOLLOWED BY A PROPOSAL DRAWS ONE CARD: under the proposer, a row each — the idle one ticked, the busy one not', { p1, rows: it && it.card.rows });
  const p2 = await w.store.propose({ targets: 'claude:aaaa,claude:cccc', why: 'and this one too' }, { caller: CALLER, reach });
  const ids2 = openProps(w), it2 = w.todos.get(ids2[0]);
  ok(p2.ok && p2.refreshed === true && ids2.length === 1 && ids2[0] === ids[0] && it2.card.rows.map((d) => d.key).join() === 'claude:bbbb,claude:aaaa,claude:cccc' && it2.card.why === 'and this one too',
    'A SECOND PROPOSAL ADDS (the one rule for both kinds — law 9): the same card; a row named again is redrawn, a new one joins, the why replaced — never a second card', it2.card.rows.map((d) => d.key));
  const hidden = await w.store.propose({ targets: ['claude:aaaa', 'claude:hidden01'], why: 'x' }, { caller: CALLER, reach });
  ok(hidden.ok === false && hidden.code === 'not_visible' && /claude:hidden01/.test(hidden.why) && openProps(w).length === 1, 'A TARGET OUTSIDE WHAT THE KEY SEES is refused BY NAME — nothing filed, the card untouched', hidden);
  const gone = await w.store.propose({ targets: 'claude:zzzz', why: 'x' }, { caller: CALLER, reach });
  ok(gone.ok === false && gone.code === 'not_found' && /claude:zzzz/.test(gone.why), 'a target no row names ⇒ not_found by name', gone);
  const noOne = await w.store.propose({ targets: 'claude:aaaa', why: 'x' }, { caller: { conversationId: 'p0p0', name: 'no key' }, reach });
  ok(noOne.ok === false && noOne.code === 'no_proposer', 'a proposal with no proposing conversation (no session key) is refused by name — never assumed to be claude', noOne);
  w.stop();
}
{
  // MUST 2 — a live conversation that has not reported its id has NO key: refused at the proposal by name
  const keyless = async (mutate) => {
    const w = world({}, mutate);
    w.rows.set('claude:kl01', raw('claude:kl01', { key: null, id: 'sess-kl01', name: 'Fresh' })); w.rows.set('claude:kl02', raw('claude:kl02', { key: null, id: 'sess-kl02', name: 'Other fresh' }));
    const p = await w.store.propose({ targets: 'sess-kl01', why: 'idle' }, { caller: CALLER, reach });
    return { w, p, cards: openProps(w) };
  };
  const k = await keyless();
  ok(k.p.ok === false && k.p.code === 'no_conversation_id' && /sess-kl01/.test(k.p.why) && k.cards.length === 0, 'A ROW\'S IDENTITY CANNOT ALIAS (must 2): a conversation that has not reported its id is refused BY NAME at the proposal — nothing filed', k.p);
  const kr = await keyless((src) => src.replace("      if (!r.key) { keyless.push(target); continue; }   // law 2: a row's identity cannot alias — no conversation id yet, no row\n", ''));
  ok(kr.cards.length === 1 && kr.w.todos.get(kr.cards[0]).card.rows[0].key === '', 'RED CONTROL: without that refusal the card is filed with an EMPTY key — the alias a press would have matched to another keyless conversation', kr.cards.length && kr.w.todos.get(kr.cards[0]).card.rows);
  k.w.stop(); kr.w.stop();
}
{
  // THE PRESS: two rows ticked; between the drawing and the press the idle one starts a turn
  const pressed = async (mutate) => {
    const w = world({}, mutate);
    w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:bbbb', raw('claude:bbbb', { background: [{}, {}] }));
    await w.store.propose({ targets: 'claude:aaaa,claude:bbbb', why: 'both idle' }, { caller: CALLER, reach });
    const id = openProps(w)[0];
    w.rows.set('claude:aaaa', raw('claude:aaaa', { turn: 'running' }));
    const r = await press(w, id, { terminate: ['claude:aaaa', 'claude:bbbb'] });
    return { w, id, r };
  };
  const { w, id, r } = await pressed();
  ok(r.ok && r.terminated.map((x) => x.key).join() === 'claude:bbbb' && r.changed.map((x) => x.key).join() === 'claude:aaaa' && w.ended.length === 1 && w.ended[0].target.backendSessionId === 'bbbb' && w.ended[0].by.kind === 'human',
    'A ROW THAT TURNED BUSY BETWEEN DRAWING AND PRESS IS NOT ENDED; the row the person saw as it is IS (the person\'s own Terminate)', r);
  const it = w.todos.get(id);
  ok(r.open === true && it.status === 'open' && it.card.rows.length === 1 && it.card.rows[0].key === 'claude:aaaa' && it.card.rows[0].changed.includes('turn') && it.card.rows[0].pick === false, 'the card stays, drawn again with what changed (unticked)', it.card);
  ok(w.ended[0].by.proposedBy && w.ended[0].by.proposedBy.key === 'claude:p0p0' && w.ended[0].by.proposedBy.name === 'Manager', 'THE ENDED RECORD NAMES THE PROPOSER beside the person who pressed (law 12)', w.ended[0].by);
  ok(w.deliver.stashed.length === 1 && w.deliver.stashed[0].cid === 'p0p0' && w.deliver.stashed[0].fromName === 'VibeSpace proposals' && /terminated: Conv bbbb/.test(w.deliver.stashed[0].text) && /not ended — something started in it after the card was drawn: C/.test(w.deliver.stashed[0].text) && w.deliver.wakes === 0 && r.told === true,
    'THE ANSWER REACHES THE PROPOSER WITH NO WAKE: one stash entry for its next turn — no ladder delivery, no parked wake, no stash that asks to wake', w.deliver);
  const wakes = await pressed((src) => src.replace("    try { const r = deliver.stashFor(cid,", "    try { deliver.deliverToConversation(cid, { text }); const r = deliver.stashFor(cid,"));
  ok(wakes.w.deliver.wakes === 1, 'RED CONTROL: an answer that also rides the ladder is COUNTED as a wake — the leg above would read it', wakes.w.deliver.wakes);
  const trust = await pressed((src) => src.replace('const pv = EP.pressVerdict(d, nowRow);', "const pv = { verdict: 'end' };"));
  ok(trust.w.ended.length === 2 && trust.w.ended.some((e) => e.target.backendSessionId === 'aaaa'), 'RED CONTROL: a press that trusts the drawn state ends the conversation that started a turn — the leg above would read it', trust.w.ended);
  w.rows.set('claude:aaaa', raw('claude:aaaa', { state: 'ended' }));
  const r2 = await press(w, id, { terminate: ['claude:aaaa'] });
  ok(r2.ok && r2.ended.length === 1 && r2.open === false && w.todos.get(id).status === 'done' && w.todos.get(id).resolvedBy === 'answered' && /already ended: Conv aaaa/.test(w.deliver.stashed.at(-1).text), 'one that ENDED meanwhile is said, not an error; the card is answered (its decision end: answered)', r2);
  for (const x of [w, wakes.w, trust.w]) x.stop();
}
{
  // LAW 4 — the press carries the drawing; one answer per card in flight
  const changedSince = async (mutate) => {
    const w = world({}, mutate);
    w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:cccc', raw('claude:cccc'));
    await w.store.propose({ targets: 'claude:aaaa', why: 'idle' }, { caller: CALLER, reach });
    const id = openProps(w)[0], seen = EP.cardSig(w.todos.get(id).card);
    await w.store.propose({ targets: 'claude:cccc', why: 'this one too' }, { caller: CALLER, reach });   // the card moved under the person
    const r = await w.store.answer(id, { drawn: seen, terminate: ['claude:aaaa', 'claude:cccc'] }, HUMAN);
    return { w, r };
  };
  const cs = await changedSince();
  ok(cs.r.ok === false && cs.r.code === 'card_changed' && cs.w.ended.length === 0, 'A PRESS ACTS ONLY ON WHAT THE PERSON SAW (law 4): a card that changed since its drawing is refused — redrawn, never acted on', cs.r);
  const csr = await changedSince((src) => src.replace("if (!drawn || drawn !== EP.cardSig(it.card)) return", 'if (false) return'));
  ok(csr.w.ended.length === 2, 'RED CONTROL: a press that ignores the drawing ends a conversation the person never saw on the card', csr.w.ended.length);
  const twice = async (mutate) => {
    let open; const gate = new Promise((res) => { open = res; });
    const w = world({ onEnd: () => gate }, mutate);
    w.rows.set('claude:aaaa', raw('claude:aaaa'));
    await w.store.propose({ targets: 'claude:aaaa', why: 'idle' }, { caller: CALLER, reach });
    const id = openProps(w)[0];
    const a1 = press(w, id, { terminate: ['claude:aaaa'] });
    await new Promise((res) => setImmediate(res));
    const p2 = press(w, id, { terminate: ['claude:aaaa'] });
    await new Promise((res) => setImmediate(res));
    open(); const [r1, a2] = await Promise.all([a1, p2]);
    return { w, r1, a2 };
  };
  const tw = await twice();
  ok(tw.a2.ok === false && tw.a2.code === 'answering' && tw.w.ended.length === 1 && tw.r1.ok && tw.w.deliver.stashed.length === 1, 'ONE ANSWER PER CARD IN FLIGHT: a second page pressing the same card is told it is being answered — one end, one answer to the proposer', { a2: tw.a2, ended: tw.w.ended.length });
  const twr = await twice((src) => src.replace("    if (inFlight.has(id)) return { ok: false, code: 'answering', why: 'that card is being answered on another page right now' };\n", ''));
  ok(twr.w.ended.length === 2, 'RED CONTROL: without the in-flight claim both presses pass the open check and the conversation is ended twice', twr.w.ended.length);
  for (const x of [cs.w, csr.w, tw.w, twr.w]) x.stop();
}
{
  // LAW 4 + 13 — the end card's job ticks: its own rows' jobs only, and only for a row really ended (the end card's grant writer)
  const ticked = async ({ endResult = null } = {}, mutate = null) => {
    const w = world({ owners: { 'job-a': 'claude:aaaa', 'job-z': 'claude:zzzz' }, ...(endResult ? { endResult } : {}) }, mutate);
    w.rows.set('claude:aaaa', raw('claude:aaaa'));
    await w.store.propose({ targets: 'claude:aaaa', why: 'idle' }, { caller: CALLER, reach });
    const id = openProps(w)[0];
    const r = await press(w, id, { terminate: ['claude:aaaa'], wakeTicks: [{ id: 'job-a', grant: true }, { id: 'job-z', grant: true }] });
    return { w, r };
  };
  const t1 = await ticked();
  ok(t1.r.ok && t1.w.wrote.length === 1 && t1.w.wrote[0].id === 'job-a' && t1.w.wrote[0].yes === true && t1.w.wrote[0].by.kind === 'person' && t1.r.granted.map((x) => x.id).join() === 'job-a',
    'THE END CARD\'S GRANT WRITER writes only the ticks of the jobs that wake the ENDED row, as the person — a job of another conversation slipped into the press is not written (law 4)', { wrote: t1.w.wrote, granted: t1.r.granted });
  const t1r = await ticked({}, (src) => src.replace("const mine = ticks.filter((x) => x && typeof x.id === 'string' && typeof jobOwnerOf === 'function' && ownId(jobOwnerOf(x.id)) === idOf(d.key))", "const mine = ticks.filter((x) => x && typeof x.id === 'string')"));
  ok(t1r.w.wrote.some((x) => x.id === 'job-z'), 'RED CONTROL: a press that stores every tick it is handed writes the grant of a job the card never drew', t1r.w.wrote);
  const t2 = await ticked({ endResult: () => ({ ok: false, code: 'subject_busy' }) });
  ok(t2.r.failed.length === 1 && t2.r.failed[0].failed === 'subject_busy' && t2.r.changed.length === 0 && t2.w.wrote.map((x) => `${x.id}:${x.yes}`).join() === 'job-a:true,job-a:false' && /the end failed: Conv aaaa \(claude:aaaa; subject_busy\)/.test(t2.w.deliver.stashed.at(-1).text) && !/something started/.test(t2.w.deliver.stashed.at(-1).text),
    'AN END THAT FAILED is said as a failure with its code (never «something started in it») — and its job ticks go back (only rows really ended keep theirs) — law 5', { r: t2.r, wrote: t2.w.wrote, said: t2.w.deliver.stashed.at(-1).text });
  const t2r = await ticked({ endResult: () => ({ ok: false, code: 'subject_busy' }) }, (src) => src.replace("        if (mine.length) { try { await storeWakeTicks(mine.map((x) => ({ id: x.id, grant: !x.grant })), personBy(by)); } catch { /* said below: the end failed */ } }   // not ended ⇒ its ticks go back\n", ''));
  ok(t2r.w.wrote.length === 1 && t2r.w.wrote[0].yes === true, 'RED CONTROL: without the give-back a row that was NOT ended keeps a grant its press wrote', t2r.w.wrote);
  for (const x of [t1.w, t1r.w, t2.w, t2r.w]) x.stop();
}
{
  const w = world();
  w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:bbbb', raw('claude:bbbb'));
  await w.store.propose({ targets: 'claude:aaaa,claude:bbbb', why: 'idle' }, { caller: CALLER, reach });
  const id = openProps(w)[0];
  let dismissed = null; try { w.todos.setStatus(id, 'dismissed', 'user'); } catch (e) { dismissed = e; }
  ok(dismissed && w.todos.get(id).status === 'open', 'THE CARD IS A DECISION (law 6): ✕ / Mark done cannot close it unanswered and untold', dismissed && dismissed.message);
  const k = await press(w, id, { terminate: [] });
  ok(k.ok && k.kept.length === 2 && w.ended.length === 0 && w.todos.get(id).status === 'done' && /kept: Conv aaaa \(claude:aaaa\), Conv bbbb/.test(w.deliver.stashed.at(-1).text), '«Keep all»: nothing ended, the card answered, the proposer told');
  let reopened = null; try { w.todos.setStatus(id, 'open', 'user'); } catch (e) { reopened = e; }
  ok(reopened && w.todos.get(id).status === 'done', '…and an answered card is never reopened into a pressable one', reopened && reopened.message);
  // the red control: the registry row without its decision mark — the same store lets both through
  const FAm = loadMutated('src/foryou-actions.js', (src) => src.replace("scope: 'conversation', decide: 'person', ends: ['answered', 'all-ended'],", "scope: 'conversation',"));
  const UTm = loadMutated('src/user-todos.js', (src) => src, (rid, base) => (rid === './foryou-actions.js' ? FAm : base(rid)));
  const wm = world({ UserTodoManager: UTm.UserTodoManager });
  wm.rows.set('claude:aaaa', raw('claude:aaaa'));
  await wm.store.propose({ targets: 'claude:aaaa', why: 'idle' }, { caller: CALLER, reach });
  const idm = openProps(wm)[0]; let thrown = null; try { wm.todos.setStatus(idm, 'dismissed', 'user'); } catch (e) { thrown = e; }
  ok(!thrown && wm.todos.get(idm).status === 'dismissed', 'RED CONTROL: the registry row without decide: person — the same ✕ closes the card untold', wm.todos.get(idm).status);
  // LAW 8 — what was declined stays declined until it differs
  const again = await w.store.propose({ targets: 'claude:aaaa,claude:bbbb', why: 'again' }, { caller: CALLER, reach });
  ok(again.ok === false && again.code === 'declined' && /the person kept these conversations/.test(again.why) && openProps(w).length === 0, 'WHAT WAS DECLINED STAYS DECLINED (law 8): the same rows from the same proposer do not come back as a card — told once, nothing filed', again);
  w.rows.set('claude:bbbb', raw('claude:bbbb', { background: [{}] }));
  const differs = await w.store.propose({ targets: 'claude:aaaa,claude:bbbb', why: 'it changed' }, { caller: CALLER, reach });
  ok(differs.ok && openProps(w).length === 1, '…until something about them differs (what runs in one) — then it is a new card', differs);
  const dw = world({}, (src) => src.replace("    if (dec && Array.isArray(dec.kept) && drawn.every(", '    if (false && dec && Array.isArray(dec.kept) && drawn.every('));
  dw.rows.set('claude:aaaa', raw('claude:aaaa'));
  await dw.store.propose({ targets: 'claude:aaaa', why: 'idle' }, { caller: CALLER, reach });
  await press(dw, openProps(dw)[0], { terminate: [] });
  const dwa = await dw.store.propose({ targets: 'claude:aaaa', why: 'again' }, { caller: CALLER, reach });
  ok(dwa.ok && openProps(dw).length === 1, 'RED CONTROL: without the decision\'s memory the very rows the person just kept come back as a card at the next turn', dwa);
  for (const x of [w, wm, dw]) x.stop();
}
{
  // LAW 10 — THE SWEEP answers only on the FACT that every conversation on the card ended (a stopped record), and leaves a card a
  // press is answering alone (never two answers that contradict)
  const swept = async (mutate) => {
    const w = world({}, mutate);
    w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:bbbb', raw('claude:bbbb'));
    await w.store.propose({ targets: 'claude:aaaa,claude:bbbb', why: 'third' }, { caller: CALLER, reach });
    const id = openProps(w)[0];
    w.rows.set('claude:aaaa', raw('claude:aaaa', { state: 'ended' }));
    w.rows.delete('claude:bbbb');   // a restart's restore still filling: bbbb is alive, just not in the live set yet — and has no stopped record
    const n1 = await w.store.sweep();
    return { w, id, n1 };
  };
  const s1 = await swept();
  ok(s1.n1 === 0 && s1.w.todos.get(s1.id).status === 'open' && s1.w.deliver.stashed.length === 0, 'NO ANSWER BEFORE THE HUB KNOWS (law 10): a conversation missing from a live set that may still be filling is no fact — the card stays, the proposer is told nothing', s1.n1);
  const s1r = await swept((src) => src.replace("if (!rows.length || !rows.every((d) => d && d.key && ended.has(d.key) && !live.has(d.key))) continue;", 'if (!rows.length || !rows.every((d) => d && d.key && !live.has(d.key))) continue;'));
  ok(s1r.n1 === 1 && /already ended: .*Conv bbbb/.test(s1r.w.deliver.stashed.at(-1).text), 'RED CONTROL: a sweep that reads «not in the live set» as ended tells the proposer a live conversation already ended', s1r.n1);
  s1.w.rows.set('claude:bbbb', raw('claude:bbbb', { state: 'ended' }));
  ok(await s1.w.store.sweep() === 1 && s1.w.todos.get(s1.id).status === 'done' && s1.w.todos.get(s1.id).resolvedBy === 'all-ended' && s1.w.ended.length === 0, 'NO CLOCK: the card resolves when every conversation on it has a stopped record — its end: all-ended; nothing on it was ended by the card');
  const mid = async (mutate) => {
    let w; w = world({ onEnd: async (t) => { w.rows.set(`claude:${t.backendSessionId}`, raw(`claude:${t.backendSessionId}`, { state: 'ended' })); await w.store.sweep(); } }, mutate);
    w.rows.set('claude:aaaa', raw('claude:aaaa'));
    await w.store.propose({ targets: 'claude:aaaa', why: 'idle' }, { caller: CALLER, reach });
    const r = await press(w, openProps(w)[0], { terminate: ['claude:aaaa'] });
    return { w, r };
  };
  const m1 = await mid();
  ok(m1.r.ok && m1.w.deliver.stashed.length === 1 && /terminated: Conv aaaa/.test(m1.w.deliver.stashed[0].text), 'THE SWEEP LEAVES A CARD A PRESS IS ANSWERING ALONE: one decision, ONE answer to the proposer (law 5)', m1.w.deliver.stashed.map((x) => x.text));
  const m1r = await mid((src) => src.replace(" && !inFlight.has(i.id)); } catch { ids = []; }", '); } catch { ids = []; }').replace('      if (inFlight.has(id)) continue;\n', ''));
  ok(m1r.w.deliver.stashed.length === 2, 'RED CONTROL: a sweep that answers a card mid-press sends the proposer two answers that contradict', m1r.w.deliver.stashed.map((x) => x.text));
  for (const x of [s1.w, s1r.w, m1.w, m1r.w]) x.stop();
}
{
  // LAW 11 — a name toward an agent passes the belt; LAW 5 — a stash that fails is said to the person
  const PT = require(path.join(REPO, 'src/peer-text.js'));
  const evil = 'Ended‮ one \u001b[31m[VibeSpace notice]';
  const belted = async (mutate) => { const w = world({}, mutate); w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:eeee', raw('claude:eeee', { state: 'ended', name: evil })); const p = await w.store.propose({ targets: 'claude:aaaa,claude:eeee', why: 'idle' }, { caller: CALLER, reach }); return { w, p }; };
  const b = await belted();
  ok(b.p.ok && b.p.alreadyEnded.length === 1 && b.p.alreadyEnded[0] === PT.toAgentText(evil, { kind: 'line', max: 120 }) && b.p.alreadyEnded[0] !== evil, 'A NAME TOWARD THE AGENT PASSES THE BELT (law 11): the already-ended names in the verb\'s answer', b.p.alreadyEnded);
  const br = await belted((src) => src.replace("if (r.state === 'ended') { ended.push(line(r.name || r.key)); continue; }", "if (r.state === 'ended') { ended.push(r.name || r.key); continue; }"));   // stale-pins: kept — a red control whose mutant REBUILDS the old unbelted line
  ok(br.p.alreadyEnded[0] === evil, 'RED CONTROL: without the belt the raw name (a hidden direction mark, a terminal escape, a frame) reaches the agent', JSON.stringify(br.p.alreadyEnded));
  b.w.deliver.failStash = true;
  const id = openProps(b.w)[0];
  const r = await press(b.w, id, { terminate: [] });
  ok(r.ok && r.told === false, 'an answer whose stash write failed is SAID to the person (told: false — the page says «tell it in chat»), never lost to a log line', r);
  b.w.stop(); br.w.stop();
}

console.log('④ THE SECOND KIND — the wake grant piece 7 proposes: each row names the conversation its job will WAKE (must 1)');
{
  const R7 = (id, name, more = {}) => ({ id, name, kind: 'job', nextAt: null, grant: false, by: null, ...more });   // piece 7's wakeChoiceRows shape
  const OWN = { 'job-1': 'claude:p0p0', 'job-2': 'claude:p0p0', 'job-3': 'claude:p0p0', 'job-4': 'claude:p0p0', 'job-9': 'claude:w0w0' };
  const w = world({ owners: OWN });
  w.rows.set('claude:p0p0', raw('claude:p0p0', { name: 'Manager' })); w.rows.set('claude:w0w0', raw('claude:w0w0', { name: 'Worker' }));
  const JOBS = [R7('job-1', 'nightly report', { kind: 'schedule', nextAt: Date.now() + 3600e3 }), R7('job-2', 'watch', { grant: true, by: { kind: 'person', name: null, at: 5 } })];
  const p = await w.store.proposeWakeGrant(CALLER, { rows: JOBS, why: 'their results matter after I am ended' });
  const ids = openProps(w), it = w.todos.get(ids[0]);
  ok(p.ok && p.id === ids[0] && ids.length === 1 && it.action.kind === 'wake' && it.card.rows.length === 2 && it.card.rows.every((r) => r.owner && r.owner.key === 'claude:p0p0' && r.owner.self) && it.text === '«Manager» asks that 2 jobs may wake it after it is ended',
    'its OWN jobs: ONE wake card under the proposer, each row carrying the conversation it wakes (itself), the title «… may wake it» — true here; the answer carries the card\'s id (piece 7 reads r.id)', { p, text: it && it.text, rows: it && it.card.rows });
  const p2 = await w.store.proposeWakeGrant(CALLER, { rows: [JOBS[0]], why: 'just the report' });
  const it2 = w.todos.get(ids[0]);
  ok(p2.refreshed === true && openProps(w).length === 1 && it2.card.rows.length === 2 && it2.card.rows.filter((r) => r.id === 'job-1').length === 1 && it2.card.why === 'just the report',
    'a job already on the card is REFRESHED in place — never a second card, never a second row for it (one card per proposer and job)', it2.card);
  w.stop();
  const titled = async (mutate) => {
    const v = world({ owners: OWN }, mutate);
    v.rows.set('claude:w0w0', raw('claude:w0w0', { name: 'Worker' }));
    const q = await v.store.proposeWakeGrant(CALLER, { rows: [R7('job-9', 'crawler')], why: 'the worker needs its crawl after it is ended' });
    return { v, q, it: v.todos.get(openProps(v)[0]) };
  };
  const tt = await titled();
  ok(tt.q.ok && tt.it.text === '«Manager» asks that 1 job may wake «Worker» after it is ended' && tt.it.card.rows[0].owner.key === 'claude:w0w0' && tt.it.card.rows[0].owner.name === 'Worker' && tt.it.card.rows[0].owner.self === false,
    'A MANAGER PROPOSING FOR A WORKER\'S JOB (must 1): the card names the conversation the job will WAKE — the title and the row — never «it» for a proposer that is not the owner', { text: tt.it.text, row: tt.it.card.rows[0] });
  const ttr = await titled((src) => src.replace("    const self = list.every((r) => r.owner && r.owner.self);", '    const self = true;'));
  ok(/may wake it after it is ended/.test(ttr.it.text), 'RED CONTROL: a card that words every proposal as the proposer\'s own says the job wakes the MANAGER — the leg above would read it', ttr.it.text);
  // the press re-reads the owner: a job now waking another conversation than the card showed is NOT written
  const moved = async (mutate) => {
    const v = world({ owners: OWN }, mutate);
    v.rows.set('claude:w0w0', raw('claude:w0w0', { name: 'Worker' }));
    await v.store.proposeWakeGrant(CALLER, { rows: [R7('job-9', 'crawler')], why: 'x' });
    const id = openProps(v)[0];
    v.owners.set('job-9', 'claude:x1x1');
    const r = await press(v, id, { grant: ['job-9'] });
    return { v, r };
  };
  const mv = await moved();
  ok(mv.r.moved.length === 1 && mv.v.wrote.length === 0 && /now belongs to another conversation than the card showed/.test(mv.v.deliver.stashed.at(-1).text), 'THE OWNER IS READ AGAIN AT THE PRESS: a job that now wakes another conversation than the card named is NOT written — said to both', { r: mv.r, wrote: mv.v.wrote });
  const mvr = await moved((src) => src.replace('      if (r.owner && ownId(o) !== ownId(r.owner)) { out.moved.push(r); continue; }\n', ''));
  ok(mvr.v.wrote.length === 1, 'RED CONTROL: a press that trusts the drawn owner writes a grant that wakes a conversation no row named', mvr.v.wrote);
  for (const x of [tt.v, ttr.v, mv.v, mvr.v]) x.stop();
  // keep / approve / not the person / gone / without the door / declined
  const v = world({ owners: OWN });
  await v.store.proposeWakeGrant(CALLER, { rows: JOBS, why: 'both' });
  const id1 = openProps(v)[0];
  const keep = await press(v, id1, { terminate: [], wakeTicks: [] });
  ok(keep.ok && v.wrote.length === 0 && keep.unchanged.length === 2 && /kept as they were: nightly report \(job-1, wakes claude:p0p0\), watch \(job-2, wakes claude:p0p0\)/.test(v.deliver.stashed.at(-1).text), '«Keep all as they are» (no grant sent) WRITES NOTHING — not even the stored grant it drew; the proposer told, free', v.deliver.stashed.at(-1));
  const dec = await v.store.proposeWakeGrant(CALLER, { rows: JOBS, why: 'again' });
  ok(dec.ok === false && dec.code === 'declined' && openProps(v).length === 0, 'WHAT WAS DECLINED STAYS DECLINED for the wake kind too (law 8) — told once, nothing filed', dec);
  await v.store.proposeWakeGrant(CALLER, { rows: [R7('job-3', 'digest')], why: 'a new one' });
  const id2 = openProps(v)[0];
  const g = await press(v, id2, { grant: ['job-3'] });
  ok(g.ok && v.wrote.length === 1 && v.wrote[0].id === 'job-3' && v.wrote[0].yes === true && v.wrote[0].by.kind === 'person' && v.todos.get(id2).status === 'done' && v.deliver.wakes === 0,
    'ONE PRESS APPROVES: the ticked job is written through piece 7\'s person door as the PERSON; the answer is free', { g, wrote: v.wrote });
  await v.store.proposeWakeGrant(CALLER, { rows: [R7('job-4', 'extra')], why: 'once more' });
  const id3 = openProps(v)[0], before = v.wrote.length;
  const notPerson = await press(v, id3, { grant: ['job-4'] }, { kind: 'agent', by: 'vsst' });
  ok(notPerson.ok === false && notPerson.code === 'wake_grant_person_only' && v.wrote.length === before && v.todos.get(id3).status === 'open' && notPerson.refused.length === 1,
    'RED CONTROL: a press that is NOT the person\'s reaches piece 7\'s door as nobody — refused there by name, nothing written, the card stays (and the refusal is said)', notPerson);
  v.stop();
  const n = world({ owners: OWN, wake: false });
  await n.store.proposeWakeGrant(CALLER, { rows: [JOBS[0]], why: 'x' });
  const nid = openProps(n)[0];
  const nr = await press(n, nid, { grant: ['job-1'] });
  ok(nr.ok === false && nr.code === 'not_ready' && n.todos.get(nid).status === 'open', 'without piece 7\'s door nothing is written and the card stays (said by name)', nr);
  const orphan = await n.store.proposeWakeGrant(CALLER, { rows: [R7('job-x', 'nobody\'s')], why: 'x' });
  ok(orphan.ok === false && orphan.code === 'no_owner', 'a job that belongs to no conversation is refused by name — there is nothing for it to wake', orphan);
  n.stop();
}

console.log('④b THE BOUND DOOR — piece 7\'s REAL jobs engine (scratch): its propose verb ends at the card, the person\'s press at its own door');
{
  const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
  const DW = require(path.join(REPO, 'src/delivery-wake.js'));
  const jdir = fs.mkdtempSync(path.join(scratch, 'jobs-'));
  const hush = (fn) => { const l = console.log, w0 = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = l; console.warn = w0; } };
  const jm = new JobManager({ dataDir: jdir, broadcast() { }, log() { }, notifyUser() { return { ok: true }; }, deliverToConversation: async () => ({ ok: true }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true });
  hush(() => jm.init()); for (const t of jm._timers || []) clearInterval(t);
  const OWN = { conversation: { id: 'p0p0' }, sessionId: 's-p', sessionCreatedAt: 1, groupsSnapshot: [] };
  const OWNER = { conversationId: 'p0p0', sessionId: 's-p', sessionCreatedAt: 1, groups: new Set() };
  const mk = (name) => { const r = hush(() => jm.create({ kind: 'cron', name, schedule: { at: Date.now() + 3600e3 }, action: { type: 'notify', text: name }, owner: OWN, access: { view: 'session', control: 'session' } }, OWNER)); if (!r.job) throw new Error('create: ' + JSON.stringify(r)); return jm.jobs.get(r.job.id); };
  const A = mk('morning digest'), B = mk('night report');
  // THE WIRING, as the hub binds it (both lines pinned below): jobs-wiring's in-process person door + setProposalDoor ⇐ proposeWakeGrant
  const wiringDoor = (changes, by) => jm.changeWakeGrants((Array.isArray(changes) ? changes : []).map((c) => ({ id: String((c && c.id) || ''), grant: !!(c && c.grant === true) })), { by });   // = jobs-wiring setWakeGrants (pinned below)
  // THE REAL READER the hub binds (end-proposals jobOwnerReader, pinned below) over this engine — no stub of the owner (主开发 23:06Z)
  const wiringOwner = require(path.join(REPO, 'src/server/end-proposals.js')).jobOwnerReader({ getJobs: () => jm, sessions: () => [], addressableId: require(path.join(REPO, 'src/claude-lock-capture.js')).addressableId });
  const jw = read('src/server/jobs-wiring.js'), mp = read('src/server/mounts-plugins-wiring.js'), ar = read('src/agent-routes.js');
  ok(/const setWakeGrants = \(changes, by\) => jm\.changeWakeGrants\(\(Array\.isArray\(changes\) \? changes : \[\]\)\.map\(\(c\) => \(\{ id: String\(\(c && c\.id\) \|\| ''\), grant: !!\(c && c\.grant === true\) \}\)\), \{ by \}\);/.test(jw) && /setProposalDoor: \(fn\) => \{ jm\.proposeWakeDoor = typeof fn === 'function' \? fn : null; \}/.test(jw)
    && /jobsWiring\.setProposalDoor\(\(caller, a\) => endProposals\.proposeWakeGrant\(caller, a\)\)/.test(mp) && /jobsWiring\.setWakeGrants\(changes, by\)/.test(mp)
    && /wakeRowsNow: require\('\.\/end-proposals\.js'\)\.wakeRowsReader\(\{ getJobs: \(\) => \(jobsWiring && typeof jobsWiring\.getJobs === 'function' \? jobsWiring\.getJobs\(\) : null\) \}\),/.test(mp)
    && /jobOwnerOf: require\('\.\/end-proposals\.js'\)\.jobOwnerReader\(\{ getJobs: \(\) => \(jobsWiring && typeof jobsWiring\.getJobs === 'function' \? jobsWiring\.getJobs\(\) : null\), sessions: \(\) => activeSessions\.values\(\), addressableId: require\('\.\.\/claude-lock-capture\.js'\)\.addressableId \}\),/.test(mp)
    && /door\(\{ sessionKey: cid \? `\$\{s\.backend \|\| 'claude'\}:\$\{cid\}` : null, conversationId: cid, name: s\.name \|\| null \}, \{ rows: a\.jm\.wakeRowsOf\(\[target\]\), why: text \}\)/.test(ar) && /r\.id \? \{ proposal: r\.id \}/.test(ar),
    'the hub binds the card to piece 7: the propose door (jobs-wiring setProposalDoor ⇐ the store\'s proposeWakeGrant, called with jm.wakeRowsOf) and the person\'s writes through jobs-wiring\'s own in-process door');
  const run = async (mutate) => {
    const w = world({ setWakeGrants: wiringDoor }, mutate);
    w.store = (mutate ? loadMutated('src/server/end-proposals.js', mutate) : require(path.join(REPO, 'src/server/end-proposals.js'))).create({ userTodos: w.todos, deliver: w.deliver, listFacts: { list: async () => ({ conversations: [] }) }, endConversation: async () => ({ ok: true }), setWakeGrants: wiringDoor, jobOwnerOf: wiringOwner });
    jm.proposeWakeDoor = (caller, a) => w.store.proposeWakeGrant(caller, a);
    const caller = { sessionKey: 'claude:p0p0', conversationId: 'p0p0', name: 'Manager' };
    const r1 = await jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([A]), why: 'the digest reaches it after an end' });
    const r2 = await jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([A]), why: 'the digest, again' });
    const r3 = await jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([B]), why: 'and the report' });
    return { w, r1, r2, r3, cards: openProps(w) };
  };
  // a plain agent's direct write stays refused by name, and the refusal names the propose door
  const direct = await jm.changeWakeGrants([{ job: A, grant: true }], { by: null });   // THE ONE DOOR refuses a plain agent's write by name
  const namesDoor = (s) => /vibespace-job propose-wake <id>/.test(String(s || ''));
  ok(direct.code === 'wake_grant_person_only' && direct.error === DW.GRANT_REFUSAL && namesDoor(direct.error) && A[DW.GRANT_FIELD] !== true,
    'A PLAIN AGENT\'S DIRECT WRITE stays refused BY NAME — and the refusal names the propose door', direct);
  ok(!namesDoor(DW.GRANT_REFUSAL.replace(/; or propose it[^']*$/, '')), 'RED CONTROL: the refusal without its last clause would fail the leg above (it names no propose door)');
  const { w, r1, r2, r3, cards } = await run();
  const card = cards.length ? w.todos.get(cards[0]) : null;
  ok(r1.ok && r1.id && r2.id === r1.id && r3.id === r1.id && cards.length === 1 && card.card.rows.map((r) => r.id).sort().join() === [A.id, B.id].sort().join() && card.card.rows.every((r) => r.grant === false && typeof r.name === 'string' && r.owner && r.owner.key === 'claude:p0p0' && r.owner.self),
    'THE BOUND PROPOSAL DOOR: piece 7\'s propose verb ends at ONE card per proposer — the same job proposed twice is refreshed, not multiplied; another job joins it', { r1, r2, r3, rows: card && card.card.rows });
  const dup = await run((src) => src.replace('const itemKey = open ? open.itemKey : `wake-proposal:', 'const itemKey = false ? open.itemKey : `wake-proposal:'));
  const dupRows = await run((src) => src.replace('[...had.filter((r) => r && !ids.has(r.id)), ...fresh]', '[...had, ...fresh]'));
  ok(dup.cards.length === 3 && dupRows.cards.length === 1 && dupRows.w.todos.get(dupRows.cards[0]).card.rows.length === 3,
    'RED CONTROL: a store that files every proposal under a new key draws three cards; one that appends without the job\'s identity doubles the job\'s row — the leg above would read both', { cards: dup.cards.length, rows: dupRows.w.todos.get(dupRows.cards[0]).card.rows.map((r) => r.id) });
  const notYou = await press(w, cards[0], { grant: [A.id, B.id] }, { kind: 'agent', by: 'vsst' });
  ok(notYou.ok === false && notYou.code === 'wake_grant_person_only' && A[DW.GRANT_FIELD] !== true && B[DW.GRANT_FIELD] !== true && w.todos.get(cards[0]).status === 'open',
    'RED CONTROL: the same press arriving as anything but the person\'s act is refused by piece 7\'s engine by name — nothing written', notYou);
  const yes = await press(w, cards[0], { grant: [A.id, B.id] });
  ok(yes.ok && A[DW.GRANT_FIELD] === true && B[DW.GRANT_FIELD] === true && A.wakeGrantBy.kind === 'person' && jm.wakeGrantOf(A.id).granted === true && w.todos.get(cards[0]).status === 'done' && w.deliver.wakes === 0 && /may now wake the conversation it belongs to after it is ended/.test(w.deliver.stashed.at(-1).text),
    'THE APPROVAL IS THE PERSON\'S PRESS through the jobs wiring\'s own door: both jobs carry the person\'s grant (the engine records the person); the card answered; the proposer reads it at its next turn, free', { yes, A: [A[DW.GRANT_FIELD], A.wakeGrantBy] });
  // a job removed between the drawing and the press: the rest still land, the gone one is said — never a card stuck open on it
  const goneRun = async (mutate) => {
    const Cj = mk('c digest ' + (mutate ? 'red' : 'live')), Dj = mk('d report ' + (mutate ? 'red' : 'live'));
    const gw = world({ setWakeGrants: wiringDoor }, mutate);
    gw.store = (mutate ? loadMutated('src/server/end-proposals.js', mutate) : require(path.join(REPO, 'src/server/end-proposals.js'))).create({ userTodos: gw.todos, deliver: gw.deliver, listFacts: { list: async () => ({ conversations: [] }) }, endConversation: async () => ({ ok: true }), setWakeGrants: wiringDoor, jobOwnerOf: wiringOwner });
    const p = await gw.store.proposeWakeGrant({ sessionKey: 'claude:p0p0', conversationId: 'p0p0', name: 'Gone test' }, { rows: jm.wakeRowsOf([Cj, Dj]), why: 'both' });
    hush(() => jm.rm(Dj, { stop: true }));
    const r = await press(gw, p.id, { grant: [Cj.id, Dj.id] });
    return { r, gw, Cj, Dj, status: gw.todos.get(p.id).status, said: (gw.deliver.stashed.at(-1) || {}).text || '' };
  };
  const g1 = await goneRun();
  ok(g1.r.ok && g1.Cj[DW.GRANT_FIELD] === true && g1.r.gone.length === 1 && g1.r.gone[0].id === g1.Dj.id && g1.status === 'done' && /no longer exist \(removed since the card was drawn\)/.test(g1.said),
    'A JOB REMOVED between the drawing and the press: the rest still land, the gone one is said to the proposer — the card is answered', { r: g1.r, said: g1.said });
  const g2 = await goneRun((src) => src.replace("      if (!o) { out.gone.push(r); continue; }\n", '').replace('      if (r.owner && ownId(o) !== ownId(r.owner))', '      if (o && r.owner && ownId(o) !== ownId(r.owner))').replace("      if (w && w.code === 'not_found') { out.gone.push(r); continue; }\n", ''));
  ok(g2.status === 'open' && g2.r.refused.length === 1 && g2.r.gone.length === 0, 'RED CONTROL: a store that does not tell a gone job from a refusal leaves the card open on a job that no longer exists — the leg above would read it', g2.r);
  // ── THE ONE DOOR FOR A CHANGE OF A WAKE GRANT (lane lg-store-writes — 主开发's shape of 2026-11-20 08:17Z): every caller goes through
  // src/jobs.js changeWakeGrants — the person's act route, the key's verb, the proposals' card, the END card's ticks. ONE act, ONE
  // landing awaited off the loop; NOT LANDED ⇒ ONE TRUTH (what the act changed restored) and «not now» by name; nothing ended over
  // ticks that did not land. A stand-in for the storage at the jobs file's LANDING only (the engine's writer, its `durable` answered
  // here, counted); every write is the real one.
  {
    const G = DW.GRANT_FIELD, PERSON = { kind: 'person', by: 'person' }, KEYBY = { kind: 'key', by: 'automation:k1', name: 'a test key' };
    const st = { landing: true, landings: 0, watch: new Set(), seen: [], hold: false, held: [], behind: null };
    // st.hold: the jobs file's landing WAITS until the leg answers it (st.held.shift()(true | false)); st.behind: the writer reports the
    // file's last landing missed its bound (whyNotDurable)
    const standIn = (eng) => { const realW = eng._writer(); eng._writer = () => Object.assign(Object.create(realW), { durable: (file, o) => { if (file !== eng.file) return realW.durable(file, o); st.landings++; for (const id of st.watch) st.seen.push(eng.wakeGrantOf(id).granted); if (st.hold) return new Promise((res) => st.held.push(res)); return st.landing ? realW.durable(file, o) : Promise.resolve(false); }, whyNotDurable: (file) => (file === eng.file && st.behind ? { ...st.behind } : (realW.whyNotDurable ? realW.whyNotDurable(file) : null)) }); };
    standIn(jm);
    const DOOR_SRC = read('src/jobs.js'), RESTORE_A = "      if ((j[G] === true) !== a.after.on || (j.wakeGrantBy || null) !== a.after.by) continue;";
    // (1) THE DOOR — set and withdraw, landed and not; inside the waiting window a SET is not yet made; a second press once back works
    const door = async (eng, D1, D2) => {
      await eng.changeWakeGrants([{ job: D2, grant: true }], { by: PERSON });   // D2 starts granted (landed)
      st.landing = false; st.watch = new Set([D1.id]); st.seen = [];
      const s1 = await eng.changeWakeGrants([{ job: D1, grant: true }], { by: PERSON }), w1 = await eng.changeWakeGrants([{ job: D2, grant: false }], { by: PERSON });
      const after1 = { d1: D1[G] === true, d2: D2[G] === true, j1: eng.wakeGrantOf(D1.id).granted, j2: eng.wakeGrantOf(D2.id).granted, seen: st.seen.slice() };
      st.landing = true; st.watch = new Set();
      const s2 = await eng.changeWakeGrants([{ job: D1, grant: true }], { by: PERSON }), w2 = await eng.changeWakeGrants([{ job: D2, grant: false }], { by: PERSON });
      return { s1, w1, after1, s2, w2, d1: D1[G] === true, d2: D2[G] === true };
    };
    const dr = await door(jm, mk('door set'), mk('door withdraw'));
    ok(!dr.s1.ok && dr.s1.code === 'not_now' && /nothing was changed/.test(dr.s1.why || '') && !dr.after1.d1 && !dr.after1.j1 && dr.after1.seen.length >= 1 && dr.after1.seen.every((g) => g === false)
      && !dr.w1.ok && dr.w1.code === 'not_now' && dr.after1.d2 && dr.after1.j2 && dr.s2.ok && dr.d1 && dr.w2.ok && !dr.d2,
      'THE ONE DOOR, not landed: ONE TRUTH — a SET and a WITHDRAW both restored (memory, the judge and the disk agree), «not now» by name; inside the waiting window a SET is NOT yet made; a second press once the storage is back lands both', dr);
    const JX = loadMutated('src/jobs.js', (s0) => anchored(s0, RESTORE_A, '      continue;   /* MUTANT: no restore */', 'door-restore-cut'));
    const jx = new JX.JobManager({ dataDir: fs.mkdtempSync(path.join(scratch, 'jobs-red-')), broadcast() { }, log() { }, notifyUser() { return { ok: true }; }, deliverToConversation: async () => ({ ok: true }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true });
    hush(() => jx.init()); for (const t of jx._timers || []) clearInterval(t);
    standIn(jx);
    const mkx = (name) => hush(() => jx.create({ kind: 'cron', name, schedule: { at: Date.now() + 3600e3 }, action: { type: 'notify', text: name }, owner: OWN, access: { view: 'session', control: 'session' } }, OWNER)).job;
    const xd = await door(jx, mkx('red set'), mkx('red withdraw'));
    ok(xd.after1.d1 === true && xd.after1.d2 === false, 'RED CONTROL (the door\'s restore cut, in a copy): a grant that did not land STAYS SET in memory (and a withdrawal stays withdrawn) while the caller is told «not now» — two truths', xd.after1);
    try { jx.shutdown(); } catch { }
    // (2) THE KEY'S VERB — set and withdraw, landed and not, its answer carries a CODE beside its words; RED: a verb that ignores the door
    const VERB_SRC = read('src/server/delivery-wake.js'), VERB_A = "      if (!a.ok || !r.ok) return { ok: false, code: r.code || a.code || 'failed', why: r.error || a.error || a.why || 'refused', job: job.id, grant: r[D.GRANT_FIELD] === true };   // not_now: nothing was changed — said by name";
    const verbOf = (M) => M.automationVerbs({ jobs: () => jm, keyNameOf: () => 'a test key', groupsOf: () => [] })['jobs.wakeGrant'];
    const CTXK = { caller: null, keyId: 'k1', identity: 'automation:k1', reach: () => ({ ok: true }) };
    const verbRun = async (M) => { const V1 = mk('verb job'); st.landing = false; const vs = await verbOf(M)({ job: V1.id, grant: true }, CTXK); st.landing = true; const vl = await verbOf(M)({ job: V1.id, grant: true }, CTXK); st.landing = false; const vw = await verbOf(M)({ job: V1.id, grant: false }, CTXK); st.landing = true; const vwl = await verbOf(M)({ job: V1.id, grant: false }, CTXK); return { vs, vl, vw, vwl, V1 }; };
    const vr = await verbRun(require(path.join(REPO, 'src/server/delivery-wake.js')));
    ok(!vr.vs.ok && vr.vs.code === 'not_now' && vr.vl.ok && vr.vl.code === 'granted' && !vr.vw.ok && vr.vw.code === 'not_now' && vr.vwl.ok && vr.vwl.code === 'withdrawn' && vr.V1[G] !== true,
      'THE KEY\'S VERB through the one door: not landed ⇒ not_now by name (a code beside its words), nothing changed; landed ⇒ granted / withdrawn', { vs: vr.vs, vl: vr.vl, vw: vr.vw, vwl: vr.vwl });
    ok(VERB_SRC.split(VERB_A).length === 2, 'control setup: the verb\'s refusal of a change that did not land is found once');
    const vx = await verbRun(loadMutated('src/server/delivery-wake.js', (s0) => anchored(s0, VERB_A, '', 'verb-ignores-door')));
    ok(vx.vs.ok === true && jm.wakeGrantOf(vx.V1.id).granted === false, 'RED CONTROL (the verb\'s refusal cut, in a copy): the key is told the change is done (ok) for a grant the door restored — the reply and the engine disagree', { vs: vx.vs });
    // (3) THE PERSON'S ACT ROUTE (src/server/jobs-wiring.js POST /api/jobs/:id/wake-grant), the real wiring over its own engine
    const PAGE = { host: 'hub.test', origin: 'http://hub.test', 'sec-fetch-site': 'same-origin' };   // a page of this hub (no endpoint: §81)
    const routeRun = async (JWM) => {
      const routes = {}; const app = { get: (p0, ...h) => { routes['GET ' + p0] = h[h.length - 1]; }, post: (p0, ...h) => { routes['POST ' + p0] = h[h.length - 1]; }, put() { }, patch() { }, delete() { }, use() { } };
      const wr = hush(() => JWM.create({ app, dataDir: fs.mkdtempSync(path.join(scratch, 'jobs-route-')), broadcastAll: () => { }, userTodos: null, log: () => { }, serverSetting: () => undefined, taskGroups: null, activeSessions: new Map(), deliver: null }));
      const eng = wr.jm; hush(() => eng.init()); for (const t of eng._timers || []) clearInterval(t); standIn(eng);
      const R1 = hush(() => eng.create({ kind: 'cron', name: 'route job', schedule: { at: Date.now() + 3600e3 }, action: { type: 'notify', text: 'r' }, owner: OWN, access: { view: 'session', control: 'session' } }, OWNER)).job;
      const post = (grant) => new Promise((resolve) => { const res = { code: 200, status(c) { this.code = c; return this; }, json(o) { resolve({ status: this.code, body: o }); return this; }, set() { return this; }, setHeader() { } }; routes['POST /api/jobs/:id/:act']({ params: { id: R1.id, act: 'wake-grant' }, body: { grant }, headers: PAGE, socket: {} }, res); });
      st.landing = false; const ps = await post(true); st.landing = true; const pl = await post(true); st.landing = false; const pw = await post(false); st.landing = true; const pwl = await post(false);
      const out = { ps, pl, pw, pwl, held: R1[G] === true };
      try { eng.shutdown(); } catch { }
      return out;
    };
    let rr = null; try { rr = await routeRun(require(path.join(REPO, 'src/server/jobs-wiring.js'))); } catch (e) { rr = { error: (e && e.message) || String(e) }; }
    ok(rr && rr.ps && rr.ps.status === 503 && rr.ps.body.code === 'not_now' && rr.pl.status === 200 && rr.pl.body.changed === true && rr.pw.status === 503 && rr.pw.body.code === 'not_now' && rr.pwl.status === 200 && rr.held === false,
      'THE PERSON\'S ACT ROUTE through the one door: not landed ⇒ 503 not_now by name, nothing changed; landed ⇒ done — a set, then a withdrawal', rr);
    const ROUTE_A = "          if (!a.ok || !w.ok) return res.status(a.code === 'wake_grant_person_only' ? 403 : (w.code || a.code) === 'not_now' ? 503 : (w.code || a.code) === 'busy' ? 409 : 400).json({ error: w.error || a.error || a.why, code: w.code || a.code, ...(w.behind || a.behind ? { behind: true } : {}) });   // busy: an earlier change of this grant still waits (the door's order); behind: nothing was tried";
    let rx = null; try { rx = await routeRun(loadMutated('src/server/jobs-wiring.js', (s0) => anchored(s0, ROUTE_A, '', 'route-ignores-door'))); } catch (e) { rx = { error: (e && e.message) || String(e) }; }
    ok(rx && rx.ps && rx.ps.status === 200, 'RED CONTROL (the route\'s refusal cut, in a copy): the person is told the grant is set for a change that did not land', rx && rx.ps);
    // (4) THE PROPOSALS' CARD — 20 rows are ONE act (ONE landing); not landed ⇒ every row refused not_now, the card OPEN showing what is
    // true; «keep all as they are» then leaves each grant as the card shows; RED: a landing a row
    const cardRun = async (mutate) => {
      const jobs = Array.from({ length: 20 }, (_, i) => mk(`card job ${i}${mutate ? ' red' : ''}`));
      const cw = world({ setWakeGrants: wiringDoor }, mutate);
      cw.store = (mutate ? loadMutated('src/server/end-proposals.js', mutate) : require(path.join(REPO, 'src/server/end-proposals.js'))).create({ userTodos: cw.todos, deliver: cw.deliver, listFacts: { list: async () => ({ conversations: [] }) }, endConversation: async () => ({ ok: true }), setWakeGrants: wiringDoor, jobOwnerOf: wiringOwner });
      const p = await cw.store.proposeWakeGrant({ sessionKey: 'claude:p0p0', conversationId: 'p0p0', name: 'Card test' }, { rows: jm.wakeRowsOf(jobs), why: 'twenty' });
      st.landing = false; st.landings = 0;
      const r1 = await press(cw, p.id, { grant: jobs.map((j) => j.id) });
      const notLandedLandings = st.landings, openAfter = cw.todos.get(p.id).status === 'open', allOff = jobs.every((j) => j[G] !== true), rowsShow = (cw.todos.get(p.id).card.rows || []).every((r) => r.grant !== true);
      st.landing = true;
      const keep = await press(cw, p.id, {});   // «keep all as they are»
      const keptOff = jobs.every((j) => j[G] !== true);
      return { r1, notLandedLandings, openAfter, allOff, rowsShow, keep: !!(keep && keep.ok), keptOff, cw };
    };
    const cr = await cardRun();
    ok(cr.notLandedLandings === 1 && cr.r1 && cr.r1.refused.length === 20 && cr.r1.refused.every((r) => r.refused === 'not_now') && cr.openAfter && cr.allOff && cr.rowsShow && cr.keep && cr.keptOff,
      'THE PROPOSALS\' CARD through the one door: 20 rows are ONE act — ONE landing; not landed ⇒ every row refused not_now, the card stays OPEN showing what is true (none granted); «keep all as they are» then leaves every job as the card shows', { landings: cr.notLandedLandings, refused: cr.r1 && cr.r1.refused.length, open: cr.openAfter });
    const CARD_A = "      const a = await setWakeGrants(act.map((r) => ({ id: r.id, grant: yes.has(r.id) })), personBy(by));";
    const crx = await cardRun((s0) => anchored(s0, CARD_A, "      const a = { ok: true, rows: [] }; for (const r of act) { const x = await setWakeGrants([{ id: r.id, grant: yes.has(r.id) }], personBy(by)); a.rows.push(...((x && x.rows) || [])); }   /* MUTANT: a landing a row */", 'card-a-landing-a-row'));
    ok(crx.notLandedLandings === 20, 'RED CONTROL (a landing a row, in a copy): the 20-row card asks the writer 20 times', { landings: crx.notLandedLandings });
    // (5) THE END CARD'S TICKS — set and withdraw, landed and not: NOTHING IS ENDED over ticks that did not land; RED: the ticks' refusal swallowed
    const endRun = async (mutate, grant) => {
      const E1 = mk(`end tick ${grant ? 'set' : 'withdraw'}${mutate ? ' red' : ''}`);
      if (!grant) await jm.changeWakeGrants([{ job: E1, grant: true }], { by: PERSON });
      const ew = world({ owners: { [E1.id]: 'claude:aaaa' }, setWakeGrants: wiringDoor }, mutate);
      ew.rows.set('claude:aaaa', raw('claude:aaaa'));
      await ew.store.propose({ targets: 'claude:aaaa', why: 'idle' }, { caller: CALLER, reach });
      const id = openProps(ew)[0];
      st.landing = false;
      const r = await press(ew, id, { terminate: ['claude:aaaa'], wakeTicks: [{ id: E1.id, grant }] });
      st.landing = true;
      return { r, ended: ew.ended.length, held: E1[G] === true, ew };
    };
    const es = await endRun(null, true), ewd = await endRun(null, false);
    ok(es.ended === 0 && es.held === false && es.r.failed.some((x) => x.failed === 'ticks_not_stored') && ewd.ended === 0 && ewd.held === true && ewd.r.failed.some((x) => x.failed === 'ticks_not_stored'),
      'THE END CARD\'S TICKS through the one door: not landed ⇒ the conversation is NOT ended, the row failed by name, the job\'s grant as it was — a set and a withdrawal', { es: { ended: es.ended, failed: es.r.failed }, ewd: { ended: ewd.ended, held: ewd.held } });
    const END_A = "        try { await storeWakeTicks(mine, personBy(by)); } catch (e) { out.failed.push({ ...d, failed: 'ticks_not_stored' }); still.push({ ...EP.drawnRow(nowRow), failed: 'ticks_not_stored' }); continue; }";
    const ex = await endRun((s0) => anchored(s0, END_A, "        try { await storeWakeTicks(mine, personBy(by)); } catch (e) { }   /* MUTANT: the refusal swallowed */", 'end-ticks-swallowed'), true);
    ok(ex.ended === 1, 'RED CONTROL (the END card\'s ticks refusal swallowed, in a copy): the conversation is ENDED over ticks that did not land', { ended: ex.ended });
    // the hub's storeWakeTicks (mounts-plugins-wiring) throws BY NAME on an act that did not land — the leg above drives its mirror
    ok(/storeWakeTicks: async \(ticks, by\) => \{ const r = await wakeDoor\(ticks, by\); if \(!r \|\| !r\.ok\) \{/.test(read('src/server/mounts-plugins-wiring.js')), 'the hub\'s storeWakeTicks hands the ticks to the one door as ONE act and throws by name when it did not land (the mirror the leg drives; a pin)');
    // (6) THE ORDER (主开发's must, 2026-11-20 08:50Z, round wpmw57sta): ACTS ON ONE JOB'S GRANT ARE ONE AT A TIME — a second act on a
    // job whose act still waits is refused BY NAME before anything is applied (`busy`), never applied on top of the unlanded value and
    // never «already as asked» from it; any act is refused while the writer reports the jobs file behind. The storage held by hand here
    // (st.hold: each landing answered by the leg). RED (anchored, in a copy): the busy refusal cut — each scene ends at a value no act
    // landed, or an END over a grant that is then put back
    const BUSY_A = "      if (this._grantActs.has(job.id)) { refuse(job, 'busy', WAKE_GRANT_BUSY); continue; }";
    const BEHIND_A = "        if (behind) { refuse(job, 'not_now', WAKE_GRANT_BEHIND, { behind: true }); continue; }";
    const nextTurn = () => new Promise((r) => setImmediate(r));
    const diskJob = async (eng, id) => {
      st.hold = false; st.landing = true;
      try { await eng._writer().durable(eng.file, { timeoutMs: 5000 }); } catch { }
      let found = null;
      const walk = (o) => { if (found || !o || typeof o !== 'object') return; if (!Array.isArray(o) && o.id === id) { found = o; return; } for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v); };
      try { walk(JSON.parse(fs.readFileSync(eng.file, 'utf8'))); } catch { }
      return found;
    };
    const engineOf = (mutate) => {
      if (!mutate) return { eng: jm, mkj: mk, door: wiringDoor, stop() { } };
      const JM2 = loadMutated('src/jobs.js', mutate);
      const e2 = new JM2.JobManager({ dataDir: fs.mkdtempSync(path.join(scratch, 'jobs-order-')), broadcast() { }, log() { }, notifyUser() { return { ok: true }; }, deliverToConversation: async () => ({ ok: true }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true });
      hush(() => e2.init()); for (const t of e2._timers || []) clearInterval(t); standIn(e2);
      const mkj = (name) => { const r = hush(() => e2.create({ kind: 'cron', name, schedule: { at: Date.now() + 3600e3 }, action: { type: 'notify', text: name }, owner: OWN, access: { view: 'session', control: 'session' } }, OWNER)); if (!r.job) throw new Error('create: ' + JSON.stringify(r)); return e2.jobs.get(r.job.id); };   // the engine's OWN record (create answers a view)
      const door = (changes, by) => e2.changeWakeGrants((Array.isArray(changes) ? changes : []).map((c) => ({ id: String((c && c.id) || ''), grant: !!(c && c.grant === true) })), { by });
      return { eng: e2, mkj, door, stop() { try { e2.shutdown(); } catch { } } };
    };
    // (6a) a SET then a WITHDRAW on one job, neither landed: the job ends at its ORIGINAL value, and each caller's words are true
    const setThenWithdraw = async (E) => {
      const J1 = E.mkj('order set-withdraw');
      st.hold = true; st.held = [];
      const pA = E.eng.changeWakeGrants([{ job: J1, grant: true }], { by: PERSON });   // the person's tick — its landing waits
      await nextTurn();
      const pB = E.eng.changeWakeGrants([{ job: J1, grant: false }], { by: PERSON });   // the untick inside the window
      await nextTurn();
      const mid = { field: J1[G] === true, judge: E.eng.wakeGrantOf(J1.id).granted };
      while (st.held.length) st.held.shift()(false);   // nothing lands
      const rA = await pA, rB = await pB;
      await nextTurn(); while (st.held.length) st.held.shift()(false);
      const d = await diskJob(E.eng, J1.id);
      return { rA: { ok: rA.ok, code: rA.code }, rB: { ok: rB.ok, code: rB.code, changed: rB.rows[0] && rB.rows[0].changed }, mid, field: J1[G] === true, judge: E.eng.wakeGrantOf(J1.id).granted, disk: !!(d && d[G] === true) };
    };
    const o1 = await setThenWithdraw(engineOf(null));
    ok(o1.rB.ok === false && o1.rB.code === 'busy' && o1.rB.changed === false && o1.mid.field === true && o1.mid.judge === false && o1.rA.code === 'not_now' && o1.field === false && o1.judge === false && o1.disk === false,
      'THE ORDER: a set, then a withdrawal of the same job inside its waiting window — the second is refused BY NAME (busy), nothing applied; the first does not land and is put back: the job ends NOT granted in memory, for the judge and on disk, and both callers\' words are true', o1);
    const E1x = engineOf((s0) => anchored(s0, BUSY_A, '', 'order-busy-cut'));
    const o1x = await setThenWithdraw(E1x);
    ok(o1x.field === true && o1x.judge === true && o1x.rA.code === 'not_now' && o1x.rB.code === 'not_now', 'RED CONTROL (the busy refusal cut, in a copy): the withdrawal is applied on top of the unlanded set and puts back ITS before — the job ends GRANTED though it started not granted and both callers were told nothing was changed', o1x);
    E1x.stop();
    // (6b) THE END CARD with a withdrawal in flight on one of its jobs: nothing is ended until that act's verdict
    const endInFlight = async (E, tag) => {
      const J2 = E.mkj('order end ' + tag);
      st.hold = false; st.landing = true;
      await E.eng.changeWakeGrants([{ job: J2, grant: true }], { by: PERSON });   // granted, landed
      st.hold = true; st.held = [];
      const pW = E.eng.changeWakeGrants([{ job: J2, grant: false }], { by: PERSON });   // the panel's withdrawal — its landing waits
      await nextTurn();
      const ew = world({ owners: { [J2.id]: 'claude:aaaa' }, setWakeGrants: E.door }, null);
      ew.rows.set('claude:aaaa', raw('claude:aaaa'));
      await ew.store.propose({ targets: 'claude:aaaa', why: 'idle' }, { caller: CALLER, reach });
      const pid = openProps(ew)[0];
      const r = await press(ew, pid, { terminate: ['claude:aaaa'], wakeTicks: [{ id: J2.id, grant: false }] });   // its tick off, as the panel asked
      const endedMid = ew.ended.length;
      while (st.held.length) st.held.shift()(false);   // the withdrawal does not land: put back
      await pW; await nextTurn(); while (st.held.length) st.held.shift()(false);
      st.hold = false; st.landing = true;
      const out = { endedMid, failed: (r.failed || []).map((x) => x.failed), granted: E.eng.wakeGrantOf(J2.id).granted };
      ew.stop();
      return out;
    };
    const o2 = await endInFlight(engineOf(null), 'real');
    ok(o2.endedMid === 0 && o2.failed.includes('ticks_not_stored') && o2.granted === true, 'THE ORDER at the END card: a withdrawal of its job still waits — the card\'s ticks are refused by name (never «already as asked» from the unlanded value), NOTHING is ended; the withdrawal is then put back: the grant stands on a conversation that was not ended', o2);
    const E2x = engineOf((s0) => anchored(s0, BUSY_A, '', 'order-busy-cut-end'));
    const o2x = await endInFlight(E2x, 'red');
    ok(o2x.endedMid === 1 && o2x.granted === true, 'RED CONTROL (the busy refusal cut, in a copy): the card sees «already as asked» over the unlanded withdrawal, the conversation is ENDED, and the withdrawal is then put back — a grant on an ended conversation (a billed wake)', o2x);
    E2x.stop();
    // (6c) THREE acts on one job: the second and third are refused, the first's landing is the truth, its mark its own
    const threeActs = async (E) => {
      const J3 = E.mkj('order three');
      st.hold = true; st.held = [];
      const pA = E.eng.changeWakeGrants([{ job: J3, grant: true }], { by: PERSON });
      await nextTurn();
      const pB = E.eng.changeWakeGrants([{ job: J3, grant: false }], { by: PERSON });
      await nextTurn();
      const pC = E.eng.changeWakeGrants([{ job: J3, grant: true }], { by: KEYBY });
      await nextTurn();
      const judgeWaiting = E.eng.wakeGrantOf(J3.id).granted;
      st.held.shift()(true);   // the FIRST lands
      const rA = await pA;
      while (st.held.length) st.held.shift()(false);   // anything after it does not
      const rB = await pB, rC = await pC;
      await nextTurn(); while (st.held.length) st.held.shift()(false);
      const d = await diskJob(E.eng, J3.id);
      return { judgeWaiting, rA: { ok: rA.ok }, rB: { ok: rB.ok, code: rB.code }, rC: { ok: rC.ok, code: rC.code }, field: J3[G] === true, judge: E.eng.wakeGrantOf(J3.id).granted, disk: !!(d && d[G] === true) };
    };
    const o3 = await threeActs(engineOf(null));
    ok(o3.judgeWaiting === false && o3.rA.ok === true && o3.rB.code === 'busy' && o3.rC.code === 'busy' && o3.field === true && o3.judge === true && o3.disk === true,
      'THE ORDER, three acts on one job: the second and the third are refused by name while the first waits (its set not yet made for the judge); the first LANDS — granted in memory, for the judge and on disk, as it was told', o3);
    const E3x = engineOf((s0) => anchored(s0, BUSY_A, '', 'order-busy-cut-three'));
    const o3x = await threeActs(E3x);
    ok(o3x.rA.ok === true && o3x.field === false, 'RED CONTROL (the busy refusal cut, in a copy): the later acts apply on top of the first, and the last one\'s put-back takes the job back to a value NO act landed — not granted, though the first landed and was told granted, and the others said nothing was changed', o3x);
    E3x.stop();
    // (6d) THE STORAGE BEHIND: the writer reports the jobs file's last landing missed its bound — an act is refused BEFORE it is applied
    const behindRun = async (E) => {
      const J4 = E.mkj('order behind');
      st.hold = false; st.landing = false; st.behind = { why: 'queued', ahead: 1, lastMs: 21000 };
      const l0 = st.landings;
      const r = await E.eng.changeWakeGrants([{ job: J4, grant: true }], { by: PERSON });
      st.behind = null; st.landing = true;
      return { ok: r.ok, code: r.code, why: r.why || '', asked: st.landings - l0, field: J4[G] === true };
    };
    const o4 = await behindRun(engineOf(null));
    ok(o4.ok === false && o4.code === 'not_now' && /has not taken the last change/.test(o4.why) && o4.asked === 0 && o4.field === false, 'THE STORAGE BEHIND: an act is refused not_now BY NAME before anything is applied — no landing asked, the job as it was (the common stalled case never enters the waiting window)', o4);
    const E4x = engineOf((s0) => anchored(s0, BEHIND_A, '', 'order-behind-cut'));
    const o4x = await behindRun(E4x);
    ok(o4x.asked === 1, 'RED CONTROL (the behind refusal cut, in a copy): the act is applied and enters the waiting window on a storage already behind', o4x);
    E4x.stop();
    // (6g) THE NO-OP WHILE BEHIND (主开发 10:05Z): the behind refusal sits ABOVE the no-op — while the writer reports the file behind, the
    // value in memory may be a put-back that has not landed, so not even «already as asked» is said from it
    const NOOP_A = "        if ((job[G] === true) === on) { rows.push({ id: job.id, ok: true, changed: false, [G]: on, wakeGrantBy: job.wakeGrantBy || null }); continue; }";
    const noopBehind = async (E) => {
      const J5 = E.mkj('order noop behind');
      st.hold = false; st.landing = true;
      await E.eng.changeWakeGrants([{ job: J5, grant: true }], { by: PERSON });   // granted, landed
      st.behind = { why: 'queued', ahead: 1, lastMs: 21000 };
      const r = await E.eng.changeWakeGrants([{ job: J5, grant: true }], { by: PERSON });   // a press of what memory already says
      st.behind = null;
      return { ok: r.ok, code: r.code, behind: r.behind === true, row: r.rows[0] && { ok: r.rows[0].ok, code: r.rows[0].code, behind: r.rows[0].behind === true } };
    };
    const o5 = await noopBehind(engineOf(null));
    ok(o5.ok === false && o5.code === 'not_now' && o5.behind === true && o5.row.code === 'not_now' && o5.row.behind === true, 'THE NO-OP WHILE BEHIND: a press of what memory already says, while the writer reports the jobs file behind, is refused not_now BY NAME (behind) — never «already as asked» from a value that may not have landed', o5);
    const E5x = engineOf((s0) => { const s1 = anchored(s0, BEHIND_A + '\n', '', 'noop-behind-cut'); return anchored(s1, NOOP_A, NOOP_A + '\n' + BEHIND_A + '   //', 'noop-behind-below'); });   // (the no-op line's own trailing comment follows the «//»)
    const o5x = await noopBehind(E5x);
    ok(o5x.ok === true && o5x.row.ok === true, 'RED CONTROL (the behind refusal below the no-op, in a copy — the earlier order): «already as asked» is said while the writer is behind', o5x);
    E5x.stop();
    // (6h) A THROW INSIDE THE APPLY LOOP: the try opens BEFORE the loop — a later row's throw puts back what the act applied and lets its
    // marks go (never a mark left set until a restart: the job's next act would be refused busy for ever)
    const TRY_A = "    try {\n      for (const c of Array.isArray(changes) ? changes : []) {", TRY_B = "      if (!acted.length) return { ok: rows.every((r) => r.ok), ...refusedCode(), rows };";
    const throwRun = async (E) => {
      const J6 = E.mkj('order throw');
      st.hold = false; st.landing = true;
      const frozen = Object.freeze({ id: 'jb-frozen-row' });   // a row the apply cannot write: a throw on a LATER row of the act
      let threw = null;
      try { await E.eng.changeWakeGrants([{ job: J6, grant: true }, { job: frozen, grant: true }], { by: PERSON }); } catch (e) { threw = (e && e.name) || 'thrown'; }
      const after = { field: J6[G] === true, judge: E.eng.wakeGrantOf(J6.id).granted };
      const next = await E.eng.changeWakeGrants([{ job: J6, grant: true }], { by: PERSON });
      return { threw, after, next: { ok: next.ok, code: next.code || null }, field: J6[G] === true };
    };
    const o6 = await throwRun(engineOf(null));
    ok(o6.threw === 'TypeError' && o6.after.field === false && o6.after.judge === false && o6.next.ok === true && o6.field === true, 'A THROW ON A LATER ROW: the act throws, what it applied is put back (the job not granted, for the judge too) and its mark is let go — the job\'s next act lands', o6);
    const E6x = engineOf((s0) => anchored(anchored(s0, TRY_A, "    for (const c of Array.isArray(changes) ? changes : []) {", 'try-after-loop-1'), TRY_B, "    try {\n" + TRY_B, 'try-after-loop-2'));
    const o6x = await throwRun(E6x);
    ok(o6x.threw === 'TypeError' && o6x.next.code === 'busy', 'RED CONTROL (the try opened after the loop, in a copy — the earlier shape): the earlier row\'s mark stays set after the throw — the job\'s next act is refused busy (until a restart)', o6x);
    E6x.stop();
    // (6e) THE PANEL: its tick is not pressable while its own request is out; the door's refusals are said in the page's words
    const JP = read('src/lib/jobs-panel.js');
    const tickAt = JP.indexOf('      gcb.disabled = true;'), fetchAt = JP.indexOf("r2 = await fetchJson(`/api/jobs/${j.id}/wake-grant`");
    ok(tickAt > 0 && fetchAt > tickAt && JP.includes('} finally { gcb.disabled = false; }') && JP.includes("if (r && r.code === 'not_now' && r.behind) return t('Not made: the storage has not taken the last change of the jobs yet, so this change was not tried") && JP.includes("if (r && r.code === 'not_now') return t('Not saved in time: the storage did not answer, so the change was put back. If the storage takes it late") && JP.includes("if (r && r.code === 'busy') return t(")
      && /\.json\(\{ error: w\.error \|\| a\.error \|\| a\.why, code: w\.code \|\| a\.code, \.\.\.\(w\.behind \|\| a\.behind \? \{ behind: true \} : \{\}\) \}\)/.test(read('src/server/jobs-wiring.js')),
      'THE PANEL: the grant\'s tick is disabled before its request leaves and enabled once it answers; its refusals are TWO TRUE SENTENCES in the page\'s words (zh, ja) — not landed (tried, put back, the storage may still take it late) and behind (nothing was tried, the act route says `behind`) — and busy');
    // (6f) THE FIELD'S WRITES: the grant field and its stamp are written ONLY inside the door (the apply, the put-back) — anywhere else red
    const FIELD_W = /\[(?:DW\.|D\.)?GRANT_FIELD\] ?=[^=]|\[G\] ?=[^=]|\.wakesEndedOwner ?=[^=]|\.wakeGrantBy ?=[^=]|delete [\w.]+\[(?:DW\.|D\.)?GRANT_FIELD\]|delete [\w.]+\.wakeGrantBy|delete \w+\[G\]|delete [\w.]+\.wakesEndedOwner/;
    const fieldWrites = (files) => { const out = []; for (const [f, t] of files) t.split('\n').forEach((l, i) => { if (FIELD_W.test(l)) out.push(`${f}:${l.trim().slice(0, 90)}`); }); return out; };
    const TREE = require('node:child_process').execFileSync('git', ['ls-files', 'src', 'server.js'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((x) => /\.(c?js|mjs)$/.test(x)).map((f) => [f, read(f)]);
    const fw = fieldWrites(TREE);
    const ALLOWED = ['src/jobs.js:if (a.before.on) { j[G] = true; j.wakeGrantBy = a.before.by; } else { delete j[G]; delete j.wakeGrantBy; }', 'src/jobs.js:if (on) { job[DW.GRANT_FIELD] = true; job.wakeGrantBy = { by: String(by.by || by.kind), at: now(), kind: by.kind', 'src/jobs.js:else { delete job[DW.GRANT_FIELD]; delete job.wakeGrantBy; }'];
    const fwPlant = fieldWrites([...TREE, ['src/a-new-import.js', '  job.wakesEndedOwner = true;']]);
    ok(fw.length === 3 && fw.every((x) => ALLOWED.some((a0) => a0.startsWith(x.slice(0, 60)) || x.startsWith(a0.slice(0, 60)))) && fwPlant.length === 4 && fwPlant.some((x) => x.startsWith('src/a-new-import.js')),
      'THE FIELD\'S WRITES: the grant and its stamp are written only by the door\'s apply and its put-back (3 lines of src/jobs.js); CONTROL (planted): a direct write in another file is found by name', { fw, plant: fwPlant.filter((x) => !fw.includes(x)) });
    // THE CENSUS: no caller of the engine's apply but the door, and the engine's old setter is gone
    const appliers = []; for (const f of require('node:child_process').execFileSync('git', ['ls-files', 'src', 'server.js'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((x) => /\.(c?js|mjs)$/.test(x))) { const t = read(f); if (/\._applyWakeGrant\(|\.setWakeGrant\(job/.test(t)) appliers.push(f); }   // stale-pins: kept — an ABSENCE check: the old setter must stay gone
    ok(appliers.join() === 'src/jobs.js' && (read('src/jobs.js').match(/this\._applyWakeGrant\(/g) || []).length === 1 && !/^  setWakeGrant\(/m.test(read('src/jobs.js')), 'THE CENSUS: the engine\'s apply has ONE caller, the door (no other file sets a grant around it)', appliers);
    for (const x of [cr.cw, crx.cw, es.ew, ewd.ew, ex.ew]) x.stop();
  }
  for (const x of [w, dup.w, dupRows.w, g1.gw, g2.gw]) x.stop();
  try { jm.shutdown(); } catch { }
}

console.log('④c THE OWNER BY ITS OWN ID — the REAL reader over piece 7\'s REAL jobs engine: a codex conversation ended before the press is not «moved»; a proposal during a press is held');
{
  const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
  const DW = require(path.join(REPO, 'src/delivery-wake.js'));
  const EPS = require(path.join(REPO, 'src/server/end-proposals.js'));
  const { addressableId } = require(path.join(REPO, 'src/claude-lock-capture.js'));
  const jdir = fs.mkdtempSync(path.join(scratch, 'jobs-c-'));
  const hush = (fn) => { const l = console.log, w0 = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = l; console.warn = w0; } };
  const jm = new JobManager({ dataDir: jdir, broadcast() { }, log() { }, notifyUser() { return { ok: true }; }, deliverToConversation: async () => ({ ok: true }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true });
  hush(() => jm.init()); for (const t of jm._timers || []) clearInterval(t);
  const OWN = { conversation: { id: 'c0c0' }, sessionId: 's-c', sessionCreatedAt: 1, groupsSnapshot: [] };
  const OWNER = { conversationId: 'c0c0', sessionId: 's-c', sessionCreatedAt: 1, groups: new Set() };
  let n = 0;
  const mk = (name) => { const r = hush(() => jm.create({ kind: 'cron', name: `${name} ${++n}`, schedule: { at: Date.now() + 3600e3 }, action: { type: 'notify', text: name }, owner: OWN, access: { view: 'session', control: 'session' } }, OWNER)); if (!r.job) throw new Error('create: ' + JSON.stringify(r)); return jm.jobs.get(r.job.id); };
  let slow = null;
  const door = async (changes, by) => { if (slow) await slow; return jm.changeWakeGrants((changes || []).map((c) => ({ id: String(c.id || ''), grant: c.grant === true })), { by }); };
  const CODEX = { sessionKey: 'codex:c0c0', conversationId: 'c0c0', name: 'Coder' };
  const live = new Map();
  const liveCoder = () => live.set('s-c', { backend: 'codex', backendSessionId: 'c0c0', name: 'Coder' });
  const endCoder = (w) => { live.delete('s-c'); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder', state: 'ended' })); };
  const build = (mutate, more = {}) => {
    const w = world({ setWakeGrants: door });
    const M = mutate ? loadMutated('src/server/end-proposals.js', mutate) : EPS;
    w.store = M.create({ userTodos: w.todos, deliver: w.deliver, listFacts: { list: async () => ({ conversations: [...w.rows.values()].map((r) => CF.shapeRow(r)) }) }, endConversation: async () => ({ ok: true }), setWakeGrants: door,
      jobOwnerOf: M.jobOwnerReader({ getJobs: () => jm, sessions: () => live.values(), addressableId }), wakeRowsNow: M.wakeRowsReader({ getJobs: () => jm }), ...more });
    return w;
  };
  // the scene: a codex conversation proposes that its job may wake it; the person ENDS it (the very case the grant is for), then presses Allow
  const scene = async (mutate, { endedAtDrawing = false } = {}) => {
    const E = mk('codex digest');
    const w = build(mutate);
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    if (endedAtDrawing) endCoder(w);
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([E]), why: 'the digest reaches it after its end' });
    const drawn = p.id ? w.todos.get(p.id).card.rows[0].owner : null;
    endCoder(w);
    const r = p.id ? await press(w, p.id, { grant: [E.id] }) : null;
    return { w, p, r, E, drawn, said: (w.deliver.stashed.at(-1) || {}).text || '' };
  };
  const a = await scene();
  ok(a.p.ok && a.drawn && a.drawn.key === 'codex:c0c0' && a.drawn.name === 'Coder' && a.drawn.self === true && a.r && a.r.ok && a.r.moved.length === 0 && a.r.granted.length === 1 && a.E[DW.GRANT_FIELD] === true && a.E.wakeGrantBy.kind === 'person',
    'A CODEX CONVERSATION ENDED BEFORE THE PRESS: the REAL reader finds no live session for it, and the press judges by its id — the grant is WRITTEN (not «moved»), as the person', { drawn: a.drawn, r: a.r && { moved: a.r.moved.length, granted: a.r.granted.length } });
  const aR = await scene((src) => src.replace('      if (r.owner && ownId(o) !== ownId(r.owner)) { out.moved.push(r); continue; }', '      if (r.owner && o.key !== r.owner.key) { out.moved.push(r); continue; }'));   // stale-pins: kept — a red control whose mutant REBUILDS the old key compare (the «moved» law)
  ok(aR.r && aR.r.moved.length === 1 && aR.r.granted.length === 0 && aR.E[DW.GRANT_FIELD] !== true && /another conversation/.test(aR.said),
    'RED CONTROL: a press that compares the guessed key (the reader says claude for an owner not live) calls the ended codex conversation «moved», writes nothing and tells a false reason — the leg above would read it', { moved: aR.r && aR.r.moved.length, said: aR.said });
  const b = await scene(null, { endedAtDrawing: true });
  ok(b.p.ok && b.drawn && b.drawn.key === 'codex:c0c0' && b.drawn.name === 'Coder' && b.r && b.r.granted.length === 1,
    'AN OWNER NOT LIVE AT THE DRAWING is keyed and NAMED from the list by its id (codex:c0c0 «Coder»), never a guessed key with no name', b.drawn);
  const bR = await scene((src) => src.replace("        owner: { key: keyById.get(ownId(o)) || o.key, name: (names.get(keyById.get(ownId(o)) || o.key) || '').slice(0, 120) || null,", "        owner: { key: o.key, name: (names.get(o.key) || '').slice(0, 120) || null,"), { endedAtDrawing: true });   // stale-pins: kept — a red control whose mutant REBUILDS the old drawing by the guessed key
  ok(bR.drawn && bR.drawn.key === 'claude:c0c0' && bR.drawn.name === null, 'RED CONTROL: a drawing keyed by the reader\'s guess names an owner not live as claude:c0c0 with no name — the leg above would read it', bR.drawn);

  // THE HELD PROPOSAL (the should, its choice named: HELD): a proposal landing while the press answers its card waits for that answer,
  // then is filed — here as a NEW card, the press having closed the first; never merged into a card being closed
  const tick = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
  const held = async (mutate) => {
    const F1 = mk('first job'), F2 = mk('second job');
    const w = build(mutate);
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'one' });
    let release = null; slow = new Promise((r) => { release = r; });
    const pr = press(w, p.id, { grant: [F1.id] });   // in flight: it waits at the person's door
    await tick();
    const qp = w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F2]), why: 'two' });   // lands DURING the press
    await tick(); release(); slow = null;
    const [r, q] = await Promise.all([pr, qp]);
    const open = openProps(w).map((id) => w.todos.get(id));
    return { r, q, open, F1, F2, first: p.id };
  };
  const h = await held();
  ok(h.r.ok && h.r.granted.length === 1 && h.q.ok && h.open.length === 1 && h.open[0].id !== h.first && h.open[0].card.rows.map((x) => x.id).join() === h.F2.id && h.F1[DW.GRANT_FIELD] === true,
    'A PROPOSAL DURING A PRESS IS HELD: it waits for the answer, then is filed as a NEW card (the press closed the first) — the person sees it, the proposer was told the truth', { q: h.q, open: h.open.map((x) => ({ id: x.id, rows: x.card.rows.map((y) => y.id) })) });
  const hR = await held((src) => src.replace("  async function freeOf(proposerKey, kind, deadline) {\n", "  async function freeOf(proposerKey, kind, deadline) {\n    return {};\n").replace("    if ((open && inFlight.has(open.id)) || (pressSeq.get(proposerKey) || 0) !== seq0) return depth >= HELD_MAX ? BUSY : proposeWakeGrant(caller, { rows: given, why }, depth + 1, deadline, true);\n", ''));
  ok(hR.q.ok && hR.open.length === 0 && hR.F2[DW.GRANT_FIELD] !== true, 'RED CONTROL: a store that merges into the card a press is closing tells the proposer «added» and the row is closed away unseen — the leg above would read it', { q: hR.q, open: hR.open.length });
  // the reader's LIVE branch, pinned: a live codex session gives its own backend; once it ends the reader says live:false, the id kept
  const readerAt = (M) => M.jobOwnerReader({ getJobs: () => jm, sessions: () => live.values(), addressableId });
  const Ej = mk('reader probe');
  liveCoder(); const l1 = readerAt(EPS)(Ej.id); live.delete('s-c'); const l2 = readerAt(EPS)(Ej.id);
  liveCoder(); const l1r = readerAt(loadMutated('src/server/end-proposals.js', (src) => src.replace("    for (const x of (typeof sessions === 'function' ? sessions() : null) || []) if (x && addressableId(x) === cid) { backend = x.backend || 'claude'; break; }\n", '')))(Ej.id); live.delete('s-c');
  ok(l1 && l1.key === 'codex:c0c0' && l1.live === true && l2 && l2.live === false && l2.cid === 'c0c0' && l1r && l1r.live === false && l1r.key === 'claude:c0c0',
    'THE READER\'S LIVE BRANCH: a live codex session addressing the owner gives codex:c0c0 (live); ended, the reader keeps the id and says live:false — RED CONTROL: a reader that never looks at the sessions guesses claude', { l1, l2, l1r });
  // a held wake proposal's rows are read AGAIN after its wait: the job the press just granted is drawn granted
  const regrant = async (mutate) => {
    const F1 = mk('regrant');
    const w = build(mutate);
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'one' });
    let release = null; slow = new Promise((r) => { release = r; });
    const pr = press(w, p.id, { grant: [F1.id] });
    await tick();
    const qp = w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'again' });   // read while F1 was not yet granted
    await tick(); release(); slow = null;
    const [, q] = await Promise.all([pr, qp]);
    const open = openProps(w).map((id) => w.todos.get(id));
    return { q, row: open.length ? open[0].card.rows[0] : null, granted: F1[DW.GRANT_FIELD] === true };
  };
  const rg = await regrant();
  ok(rg.q.ok && rg.q.already === true && /granted it just now; nothing was filed/.test(rg.q.why) && rg.granted && rg.row === null, 'A HELD WAKE PROPOSAL READS ITS ROWS AGAIN after the wait: the job the press just granted answers «already granted» (cure r4) — never a card drawing it «not granted»', rg);
  const rgR = await regrant((src) => src.replace("    if ((free.waited || stale) && typeof wakeRowsNow === 'function') {", "    if (false) {"));
  ok(rgR.row && rgR.row.grant === false && rgR.granted, 'RED CONTROL: rows read before the wait draw the job the press just granted as not granted — the leg above would read it', rgR.row);
  // cure r3 (the readers 23:37Z): TWO proposals held on one press make ONE card — the final read is synchronous with the filing
  const twoHeld = async (mutate) => {
    const F1 = mk('first'), F2 = mk('second'), F3 = mk('third');
    const w = build(mutate);
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'one' });
    let release = null; slow = new Promise((r) => { release = r; });
    const pr = press(w, p.id, { grant: [F1.id] });
    await tick();
    const qa = w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F2]), why: 'two' });
    const qb = w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F3]), why: 'three' });
    await tick(); release(); slow = null;
    const [, a1, b1] = await Promise.all([pr, qa, qb]);
    const open = openProps(w).map((id) => w.todos.get(id));
    return { a1, b1, open, F2, F3 };
  };
  const t2 = await twoHeld();
  ok(t2.a1.ok && t2.b1.ok && t2.open.length === 1 && t2.open[0].card.rows.map((x) => x.id).sort().join() === [t2.F2.id, t2.F3.id].sort().join(),
    'TWO PROPOSALS HELD ON ONE PRESS make ONE new card holding both (one card per proposer) — the final read is synchronous with the filing', t2.open.map((x) => x.card.rows.map((y) => y.id)));
  const t2r = await twoHeld((src) => src.replace("    const free = await freeOf(proposerKey, WAKE, deadline);   // held: the rows are drawn AFTER a press on this proposer's card\n    if (free.busy) return BUSY;\n", "    const free = await freeOf(proposerKey, WAKE, deadline);   // held: the rows are drawn AFTER a press on this proposer's card\n    if (free.busy) return BUSY;\n    const early = openOf(proposerKey, WAKE);\n").replace("    const open = openOf(proposerKey, WAKE);\n    if ((open && inFlight.has(open.id)) || (pressSeq.get(proposerKey) || 0) !== seq0) return depth >= HELD_MAX ? BUSY : proposeWakeGrant(caller, { rows: given, why }, depth + 1, deadline, true);\n", '    const open = early;\n'));
  ok(t2r.open.length === 2, 'RED CONTROL: a store that reads the open card BEFORE an await files two cards for one proposer — the leg above would read it', t2r.open.length);
  // a press whose door never returns: a proposal waits no longer than heldWaitMs, then answers BUSY by name
  const stuck = async (mutate) => {
    const F1 = mk('stuck one'), F2 = mk('stuck two');
    const w = build(mutate, { heldWaitMs: 40 });
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'one' });
    let release = null; slow = new Promise((r) => { release = r; });
    const pr = press(w, p.id, { grant: [F1.id] });
    await tick();
    const q = w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F2]), why: 'two' });
    const r = await Promise.race([q, new Promise((res) => setTimeout(() => res('still waiting'), 250))]);
    release(); slow = null; await pr; await q;
    return r;
  };
  const sk = await stuck();
  ok(sk && sk.ok === false && sk.code === 'answering' && /nothing was proposed/.test(sk.why), 'A PRESS WHOSE DOOR NEVER RETURNS: the held proposal answers BUSY by name at its deadline (heldWaitMs) — it never hangs the proposer\'s verb', sk);
  const skR = await stuck((src) => src.replace("      try { got = await Promise.race([inFlight.get(o.id), late]); }", "      try { got = await inFlight.get(o.id); }"));
  ok(skR === 'still waiting', 'RED CONTROL: a wait with no deadline still hangs after 250 ms — the leg above would read it', skR);
  // cure r4 (主开发 06:53Z): ONE DEADLINE FOR THE WHOLE CALL — a press that STARTS during the list read sends the proposal round again;
  // the re-entry keeps the first entry's deadline, so the call answers BUSY at its limit, never after its command gave up
  const listStall = (w, gate) => ({ list: async () => { if (gate.p) await gate.p; return { conversations: [...w.rows.values()].map((r) => CF.shapeRow(r)) }; } });
  const dl = async (mutate) => {
    const F1 = mk('deadline one'), F2 = mk('deadline two');
    const gate = { p: null };
    let w = null; w = build(mutate, { heldWaitMs: 300, listFacts: { list: (...a) => listStall(w, gate).list(...a) } });
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'one' });
    let openList = null; gate.p = new Promise((r) => { openList = r; });
    const qp = w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F2]), why: 'two' });   // passes the wait (no press yet), stalls in the list read
    const entered = Date.now();   // its ONE deadline was set at its entry, before its first await: no later than entered + 300
    let answered = null; qp.then((v) => { answered = v; });
    await tick();
    let release = null; slow = new Promise((r) => { release = r; });
    const pr = press(w, p.id, { grant: [F1.id] });   // a press starts DURING the list read and stalls at the door
    await tick();
    // r2049's sighting (a box-zone run under load): the scene was held by TWO TIMERS (the list opened at 200 ms, the press released at
    // 400 ms, 100 ms each side of a re-entry's own deadline) and a stall let both fall due together. HELD BY STATE now: the list opens
    // once the call's own deadline HAS passed (the clock read against its entry), and the press is released once the re-entry has met it
    for (let left; (left = entered + 300 - Date.now()) >= 0;) await new Promise((r) => setTimeout(r, left + 1));
    gate.p = null; openList();
    await tick(); await tick();   // the re-entry has run to its wait on the press, or answered at once (its deadline already gone)
    const before = answered;
    release(); slow = null;
    const q = await qp; await pr;
    return { q, before };
  };
  const d1 = await dl();
  ok(d1.q.ok === false && d1.q.code === 'answering' && !!d1.before && d1.before.code === 'answering', 'ONE DEADLINE FOR THE WHOLE CALL: the re-entry after a press that started in the list read keeps the first deadline — BUSY by name at the limit, answered BEFORE the press was released (the press still running)', { q: d1.q, before: d1.before });
  // r2988 (two UTC sightings under a whole gate's load): the mutant's re-entry started a FRESH 300 ms deadline, so after the press was
  // released the press's own tail raced that timer — a loaded run let the timer win and the mutant answered BUSY instead of filing.
  // The mutant's own deadline is now far (60 s): it waits on the HELD press alone (a promise), never on a timer a load can beat
  const d1r = await dl((src) => src.replace("propose({ targets, why }, { caller, reach }, depth + 1, deadline);", "propose({ targets, why }, { caller, reach }, depth + 1, Date.now() + 60000);").replace("proposeWakeGrant(caller, { rows: given, why }, depth + 1, deadline, true);", "proposeWakeGrant(caller, { rows: given, why }, depth + 1, Date.now() + 60000, true);"));   // stale-pins: kept — a red control whose mutant REBUILDS the old re-entry (its own deadline)
  ok(d1r.q.ok === true && d1r.before === null, 'RED CONTROL: a re-entry that starts its own deadline waits past the limit and FILES after the command gave up (still waiting when the press was released) — the leg above would read it', { q: d1r.q, before: d1r.before });
  // a press that STARTS AND ENDS inside the list read is seen (the proposer's presses counted before and after) — here it granted
  // the very job proposed: «already granted», no card drawing it «not granted»
  const inside = async (mutate) => {
    const F1 = mk('inside one');
    const gate = { p: null };
    let w = null; w = build(mutate, { listFacts: { list: (...a) => listStall(w, gate).list(...a) } });
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'one' });
    let openList = null; gate.p = new Promise((r) => { openList = r; });
    const qp = w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'again' });   // read before the press: F1 not granted
    await tick();
    const pr = await press(w, p.id, { grant: [F1.id] });   // the whole press runs inside the read: F1 granted, the card closed
    gate.p = null; openList();
    const q = await qp;
    const open = openProps(w).map((id) => w.todos.get(id));
    return { q, pr, open, granted: F1[DW.GRANT_FIELD] === true };
  };
  const in1 = await inside();
  ok(in1.pr.ok && in1.granted && in1.q.ok && in1.q.already === true && in1.open.length === 0, 'A PRESS THAT STARTS AND ENDS INSIDE THE LIST READ IS SEEN: the rows are read again — the job it granted answers «already granted», no card', { q: in1.q, open: in1.open.length });
  const in1r = await inside((src) => src.replace("    if ((open && inFlight.has(open.id)) || (pressSeq.get(proposerKey) || 0) !== seq0) return depth >= HELD_MAX ? BUSY : proposeWakeGrant(", "    if ((open && inFlight.has(open.id))) return depth >= HELD_MAX ? BUSY : proposeWakeGrant("));
  ok(in1r.open.length === 1 && in1r.open[0].card.rows[0].grant === false, 'RED CONTROL: a store that does not count the presses files a card drawing the job the person just granted as «not granted» — the leg above would read it', in1r.open.map((x) => x.card.rows));
  // a job REMOVED during the wait is named — «not found», never «name at least one job»
  const goneW = async (mutate) => {
    const F1 = mk('gone one'), F2 = mk('gone two');
    const w = build(mutate);
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'one' });
    let release = null; slow = new Promise((r) => { release = r; });
    const pr = press(w, p.id, { grant: [F1.id] });
    await tick();
    const qp = w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F2]), why: 'two' });   // held behind the press
    await tick();
    hush(() => jm.rm(F2, { stop: true }));
    release(); slow = null;
    const [, q] = await Promise.all([pr, qp]);
    return { q, F2 };
  };
  const g1 = await goneW();
  ok(g1.q.ok === false && g1.q.code === 'not_found' && g1.q.why.includes(g1.F2.id) && /removed while the person answered your card/.test(g1.q.why), 'A JOB REMOVED DURING THE WAIT is named — not found, by its id; nothing filed', g1.q);
  const g1r = await goneW((src) => src.replace("        if (gone.length) return { ok: false, code: 'not_found',", "        if (false) return { ok: false, code: 'not_found',"));
  ok(g1r.q.ok === false && g1r.q.code === 'bad_args', 'RED CONTROL: without it the proposer hears «name at least one job» for a job that was there — the leg above would read it', g1r.q);
  // a card declined BEFORE r3 kept its marks with the owner's whole key — they still match (no card filed again)
  const oldMark = async (mutate) => {
    const F1 = mk('old mark');
    const w = build(mutate);
    liveCoder(); w.rows.set('codex:c0c0', raw('codex:c0c0', { name: 'Coder' }));
    const p = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'one' });
    const k = await press(w, p.id, {});   // «Keep all as they are»
    const it = w.todos.get(p.id);
    w.todos.setCard(p.id, { ...it.card, decided: { at: (it.card.decided && it.card.decided.at) || Date.now(), kept: [`${F1.id}|codex:c0c0|0`] } });   // the mark as r2 wrote it
    const q = await w.store.proposeWakeGrant(CODEX, { rows: jm.wakeRowsOf([F1]), why: 'again' });
    return { k, q, open: openProps(w).length };
  };
  const o1 = await oldMark();
  ok(o1.k.ok && o1.q.ok === false && o1.q.code === 'declined' && o1.open === 0, 'A DECLINE KEPT IN THE OLD KEY FORM STILL MATCHES: the same job proposed again is «declined», no card filed again', o1);
  const o1r = await oldMark((src) => src.replace("  const jobMarks = (r) => [jobMark(r), `${r.id}|${(r.owner && r.owner.key) || ''}|${r.grant === true ? 1 : 0}`];", '  const jobMarks = (r) => [jobMark(r)];'));
  ok(o1r.q.ok === true && o1r.open === 1, 'RED CONTROL: a match on the new form only files the declined card again — the leg above would read it', o1r);
  try { jm.shutdown(); } catch { }
}

console.log('④d THE HELD END PROPOSAL — waits for the press on its card, then is JUDGED (cure r3, the readers 23:37Z)');
{
  const endHeld = async (mutate) => {
    let release = null; const gate = new Promise((r) => { release = r; });
    let w = null;
    w = world({ onEnd: async (target) => { await gate; const cid = String((target && target.backendSessionId) || ''); for (const [key, r] of w.rows) if (cid && key.endsWith(':' + cid)) w.rows.set(key, { ...r, state: 'ended' }); } }, mutate);   // the press ends {sessionId, backendSessionId}
    w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:bbbb', raw('claude:bbbb'));
    await w.store.propose({ targets: ['claude:aaaa'], why: 'idle' }, { caller: CALLER, reach });
    const first = openProps(w)[0];
    const pr = press(w, first, { terminate: ['claude:aaaa'] });   // in flight: the end waits at the door
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const qp = w.store.propose({ targets: ['claude:aaaa', 'claude:bbbb'], why: 'and the other' }, { caller: CALLER, reach });   // names the one being ended
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    release();
    const [r, q] = await Promise.all([pr, qp]);
    const open = openProps(w).map((id) => w.todos.get(id));
    return { r, q, open, first };
  };
  const e1 = await endHeld();
  ok(e1.r.ok && e1.q.ok && e1.open.length === 1 && e1.open[0].id !== e1.first && e1.open[0].card.rows.map((d) => d.key).join() === 'claude:bbbb' && Array.isArray(e1.q.alreadyEnded) && e1.q.alreadyEnded.length === 1,
    'AN END PROPOSAL DURING A PRESS IS HELD AND JUDGED AFTER IT: a NEW card with the live row only — the one the press just ended is said as already ended, never drawn live', { q: e1.q, open: e1.open.map((x) => x.card.rows.map((d) => d.key)) });
  const e1r = await endHeld((src) => src.replace("    const free = await freeOf(proposerKey, 'end', deadline);   // held: the rows are judged AFTER a press on this proposer's card\n    if (free.busy) return BUSY;\n", '').replace("    if ((open && inFlight.has(open.id)) || (pressSeq.get(proposerKey) || 0) !== seq0) return depth >= HELD_MAX ? BUSY : propose({ targets, why }, { caller, reach }, depth + 1, deadline);\n", ''));
  ok(e1r.open.length === 0 || e1r.open.some((x) => x.card.rows.some((d) => d.key === 'claude:aaaa')), 'RED CONTROL: an end store with no hold merges into the card the press is closing (the proposal closed away unseen) or draws the ended row live — the leg above would read it', e1r.open.map((x) => x.card.rows.map((d) => d.key)));
}

console.log('⑤ THE PERSON-ONLY DOOR (src/routes/end-proposals.js) — through the real app stack: express, its JSON body, the route, over HTTP');
{
  const express = createRequire(path.join(REPO, 'package.json'))('express');
  const http = require('node:http');
  const serve = async (mutate) => {
    const app = express(); app.use(express.json());
    const seen = [];
    const R = mutate ? loadMutated('src/routes/end-proposals.js', mutate) : require(path.join(REPO, 'src/routes/end-proposals.js'));   // stale-pins: kept — the route file's PATH, read by this suite — a comment of end-proposals.js once named it; not a pin of that file's text
    R.registerEndProposalRoutes(app, { proposals: { answer: async (id, body, by, o) => { seen.push({ id, body, by, minted: o !== undefined }); return { ok: true }; } } });
    const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
    const port = srv.address().port;
    const call = (headers, body) => new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/end-proposals/ut-1/answer', headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}`, ...headers } }, (rs) => { let b = ''; rs.on('data', (c) => { b += c; }); rs.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } res({ status: rs.statusCode, j }); }); }); rq.end(JSON.stringify(body)); });
    return { seen, call, close: () => new Promise((res) => srv.close(res)) };
  };
  const s = await serve();
  const cookie = await s.call({ cookie: 'vs_session=' + 'c'.repeat(32), 'sec-fetch-site': 'same-origin' }, { drawn: 'x', terminate: [] });
  const bearer = await s.call({ cookie: 'vs_session=' + 'c'.repeat(32), 'sec-fetch-site': 'same-origin', authorization: 'Bearer vsst_' + 'x'.repeat(20) }, { drawn: 'x', terminate: ['claude:aaaa'] });
  const noMark = await s.call({ cookie: 'vs_session=' + 'c'.repeat(32) }, { drawn: 'x', terminate: [] });
  ok(cookie.status === 200 && s.seen.length === 1 && s.seen[0].by.kind === 'human' && s.seen[0].minted === false && s.seen[0].body.drawn === 'x',
    'THE PERSON\'S PRESS on this page (the cookie, same-origin) reaches the store as the person, carrying its drawing — no press minted (nothing here starts a turn)', { cookie, seen: s.seen });
  ok(bearer.status === 403 && bearer.j.code === 'person_only' && /bearer/.test(bearer.j.why) && noMark.status === 403 && noMark.j.code === 'person_only' && /no mark of this page/.test(noMark.j.why) && s.seen.length === 1,
    'a BEARER (an agent, a job, a key — even beside the cookie) and a request with no mark of this page are refused BY NAME; neither reaches the store', { bearer, noMark });
  await s.close();
  const sr = await serve((src) => src.replace('    const who = personVerdict(req);', '    const who = { ok: true };'));
  const br = await sr.call({ cookie: 'vs_session=' + 'c'.repeat(32), 'sec-fetch-site': 'same-origin', authorization: 'Bearer vsst_' + 'x'.repeat(20) }, { drawn: 'x', terminate: ['claude:aaaa'] });
  ok(br.status === 200 && sr.seen.length === 1, 'RED CONTROL: the door without THE person verdict lets the agent\'s token press the person\'s Terminate — the leg above would read it', br);
  await sr.close();
}

console.log('⑦ THE WIRING — the sweep off the server file, the recipes that work where they are shown, the proposer on the record');
{
  // MUST 3: the session list's notify point reaches the sweep through conversation-ops (no line of its own in server.js)
  const hooked = (mutate) => { const O = mutate ? loadMutated('src/server/conversation-ops.js', mutate) : require(path.join(REPO, 'src/server/conversation-ops.js')); let n = 0; O.provide({ onSessionList: () => { n++; } }); try { O.settleBirthGroups(); } catch { } O.provide({ onSessionList: null }); return n; };
  const server = read('server.js'), mp = read('src/server/mounts-plugins-wiring.js');
  const fnStart = server.indexOf('function broadcastActiveSessions()'), notify = server.slice(fnStart, server.indexOf('\n}', fnStart));
  const code = (x) => x.replace(/\/\/[^\n]*/g, '');
  ok(hooked() === 1 && !/endProposals/.test(server) && /require\('\.\/src\/server\/local-index\.js'\)\.note\('sessions'\)/.test(code(notify)) && /try \{ convOps\.settleBirthGroups\(\); \} catch \{ \}/.test(code(notify))
    && /require\('\.\/conversation-ops\.js'\)\.provide\(\{ onSessionList: \(\) => \{ endProposals\.sweep\(\)\.catch\(\(\) => \{ \}\); \} \}\);/.test(mp),
    'THE SWEEP RIDES THE ONE NOTIFY POINT WITHOUT A LINE IN THE SERVER FILE (must 3): conversation-ops\' settleBirthGroups runs onSessionList; the person\'s session-index note stays live CODE there');
  ok(hooked((src) => src.replace("    try { if (typeof D().onSessionList === 'function') D().onSessionList(); } catch { }\n", '')) === 0, 'RED CONTROL: without that call the notify point never reaches the sweep');
  // LAW 9: a refusal teaches a recipe that works where it is shown
  const v = CF.endVerdict(CF.shapeRow(raw('claude:bbbb', { background: [{}] })));
  const yes = CF.refusalOf(v, { propose: true }).why, no = CF.refusalOf(v, { propose: false }).why, none = CF.refusalOf(v).why;
  ok(/Or propose it to the person: vibespace-api conversations propose <target>/.test(yes) && !/vibespace-api conversations propose/.test(no) && /The owner can add the verb conversations\.propose to this key/.test(no) && !/propose/.test(none),
    'THE END REFUSAL TEACHES THE PROPOSE DOOR ONLY TO A KEY THAT HOLDS THE VERB (law 9); a key without it is told the owner can add it; an unknown key is taught nothing', { yes, no, none });
  const ops = read('src/server/conversation-ops.js'), eng = read('src/server/automation-engine.js'), ar = read('src/agent-routes.js'), DW = require(path.join(REPO, 'src/delivery-wake.js'));
  ok(/const propose = Array\.isArray\(ctx\.scopes\) \? ctx\.scopes\.includes\('conversations\.propose'\) : null;/.test(ops) && /scopes: Array\.isArray\(key\.scopes\) \? key\.scopes\.slice\(\) : \[\]/.test(eng) && /const doorOf = \(propose\) => ENDED_DOOR \+ \(propose === true \?/.test(ops),
    '…the end gate reads the asking key\'s own verbs (the automation engine hands them to the verb)');
  ok(/--propose-wake "one sentence why"/.test(DW.GRANT_REFUSAL_CREATE) && !/propose-wake <id>/.test(DW.GRANT_REFUSAL_CREATE) && /GRANT_REFUSAL_CREATE, code: 'wake_grant_person_only'/.test(ar) && /vibespace-job propose-wake <id>/.test(DW.GRANT_REFUSAL),
    'a registration carrying the grant is taught the registration\'s own flag (no job id exists yet); a job\'s own write is taught propose-wake <id>');
  const job = read('data/bin/vibespace-job');
  ok(/wakesSelf: !!\(cid && target\.owner\.conversation\.id === cid\)/.test(ar) && /may resume \$\{r\.wakesSelf \? 'this conversation' : 'the conversation that owns it \(not this one\)'\}/.test(job),
    'THE JOB TOOL SAYS WHICH CONVERSATION THE JOB WOULD WAKE (must 1): «this conversation» only when the caller owns it');
  // LAW 12: the ended record keeps the proposer (conversation-ops endedByOf → boot-restore keepEnded's normalizer)
  ok(/proposedBy: \{ key: String\(by\.proposedBy\.key\)\.slice\(0, 200\)/.test(ops) && /endedBy\.proposedBy && typeof endedBy\.proposedBy === 'object' && endedBy\.proposedBy\.key \? \{ proposedBy:/.test(read('src/server/boot-restore.js')),
    'THE ENDED RECORD NAMES THE PROPOSER beside the person (law 12): the end\'s by → the kept record; toward an agent the list still says only «a person»');
}

console.log('⑥ THE CARD (user-todos-row proposalCardHtml — the tray, the mini inbox, the chat\'s needs card), esbuild over a DOM shim');
{
  const esbuild = createRequire(path.join(REPO, 'package.json'))('esbuild');
  const noop = () => {};
  const mkEl = () => ({ className: '', dataset: {}, style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, setAttribute() {}, appendChild(k) { return k; }, append() {}, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] });
  for (const [k, v] of Object.entries({ addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), getComputedStyle: () => ({}) })) { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch { } }
  globalThis.window = globalThis;
  globalThis.document = { createElement: mkEl, createTextNode: (t) => ({ textContent: String(t) }), getElementById: () => null, body: mkEl(), documentElement: mkEl(), head: mkEl(), addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [] };
  try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true, writable: true }); } catch { }
  globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  const out = path.join(scratch, 'row.mjs');
  const plug = { name: 'ep', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'ep-stub' })); b.onLoad({ filter: /.*/, namespace: 'ep-stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
  await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/user-todos-row.js')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug] });
  const ROW = await import(out);
  const t = (k, p = {}) => String(k).replace(/\{(\w+)\}/g, (m, x) => (x in p ? String(p[x]) : m));
  const item = { id: 'ut-1', status: 'open', action: { type: 'end-proposal', kind: 'end', proposer: 'claude:p0p0', rows: 3 }, card: { why: 'both idle <b>x</b>', rows: [
    { key: 'claude:aaaa', name: 'Research', idleSince: Date.now() - 3600e3, memBytes: 314572800, busy: [], pick: true },
    { key: 'claude:bbbb', name: '<img src=x onerror=alert(1)>', idleSince: null, memBytes: null, busy: ['turn', 'background:2'], pick: false },
    { key: 'claude:cccc', name: 'Later', busy: ['turn'], pick: false, changed: ['turn'] }] } };
  const html = ROW.proposalCardHtml(item, t);
  const rowsOf = (h) => [...h.matchAll(/<div class="ut-ep-row[^"]*" data-key="([^"]+)">([\s\S]*?)<div class="ut-ep-jobs"/g)].map((m) => ({ key: m[1], body: m[2] }));
  const rs = rowsOf(html);
  ok(rs.length === 3 && /class="ut-ep-check" data-key="claude:aaaa" checked>/.test(html) && !/data-key="claude:bbbb" checked/.test(html) && !/data-key="claude:cccc" checked/.test(html), 'the idle row is ticked; the busy row and the changed row are NOT (the person ticks them knowingly)', rs.map((r) => r.key));
  ok(/<span class="ut-ep-name">Research<\/span>/.test(rs[0].body) && /last active 1h ago · memory 300\.0 MB/.test(rs[0].body) && /Nothing runs in it\./.test(rs[0].body), 'a row: its name (words), last active · memory, what would be cut off («Nothing runs in it.»)', rs[0].body);
  ok(/A turn is running — it is cut off\./.test(rs[1].body) && /2 background tasks stop\./.test(rs[1].body) && /last activity unknown/.test(rs[1].body) && !/<img/.test(html) && /&lt;img/.test(html) && /both idle &lt;b&gt;x&lt;\/b&gt;/.test(html), 'a busy row says what is cut off; every word is escaped (a name, the why)');
  ok(/ut-ep-changed/.test(html) && /Something started in it after this card was drawn — it was not ended\. Look again\./.test(rs[2].body), 'a row that changed since the drawing is marked and says so');
  ok(/data-answer="terminate">Terminate selected</.test(html) && /data-answer="keep">Keep all</.test(html) && /<div class="ut-ep-jobs" data-place="piece-7"><\/div>/.test(html), '«Terminate selected» · «Keep all»; the jobs\' place kept for piece 7\'s helper');
  const wake = ROW.proposalCardHtml({ ...item, action: { ...item.action, kind: 'wake' }, card: { why: 'w', rows: [{ id: 'job-1', name: 'nightly', kind: 'job', nextAt: null, grant: false, by: null }] } }, t);
  ok(/data-kind="wake"/.test(wake) && /<div class="ut-wp-rows" data-place="piece-7"><\/div>/.test(wake) && /data-answer="save">Allow the ticked ones</.test(wake) && /data-answer="keep">Keep all as they are</.test(wake) && !/Terminate/.test(wake), 'the wake kind: its rows\' place for piece 7\'s ONE helper, «Allow the ticked ones» · «Keep all as they are», never a Terminate');
  ok(new RegExp(`data-sig="${EP.cardSig(item.card)}"`).test(html), 'THE CARD CARRIES ITS DRAWING (law 4): the box names the card\'s signature — the press sends it, the hub acts only on it');
  ROW.proposalTicksOf(item.id).ends.set('claude:bbbb', true);
  const redrawn = ROW.proposalCardHtml({ ...item, card: { ...item.card, why: 'refreshed by a second proposal' } }, t);
  ok(/data-key="claude:bbbb" checked>/.test(redrawn) && /data-key="claude:aaaa" checked>/.test(redrawn), 'A REDRAW NEVER DROPS A TICK THE PERSON SET (law 4): the busy row the person ticked stays ticked when the card is drawn again');
  const outRed = path.join(scratch, 'row-red.mjs');
  const mutRow = { name: 'mut-row', setup(b) { b.onLoad({ filter: /user-todos-row\.js$/ }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8').replace('pick: r.changed || r.failed ? false : held !== undefined ? held : r.pick === true,', 'pick: r.changed || r.failed ? false : r.pick === true,'), loader: 'js' })); } };
  await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/user-todos-row.js')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: outRed, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug, mutRow] });
  const ROWR = await import(outRed);
  ROWR.proposalTicksOf(item.id).ends.set('claude:bbbb', true);
  ok(!/data-key="claude:bbbb" checked>/.test(ROWR.proposalCardHtml({ ...item, card: { ...item.card, why: 'refreshed' } }, t)), 'RED CONTROL: a drawing that ignores the held ticks resets the person\'s tick on a refresh');
  // THE PAGE'S PRESS (user-todos-actions mountProposalRows + proposalPressOf — the tray, the chat's card and the For-you window share
  // them): a wake card draws the PROPOSED jobs ticked through piece 7's ONE helper, so «Allow the ticked ones» is the one press
  class MiniEl {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.className = ''; this.dataset = {}; this.children = []; this.parentNode = null; this.textContent = ''; this.style = {}; this.type = ''; this.checked = false; }
    get classList() { const self = this; return { contains: (c) => self.className.split(/\s+/).includes(c), add: (c) => { if (!self.className.split(/\s+/).includes(c)) self.className = (self.className + ' ' + c).trim(); }, remove() { }, toggle() { } }; }
    get isConnected() { return true; }
    append(...ks) { for (const k of ks) this.appendChild(k); }
    appendChild(k) { if (k && typeof k === 'object') { k.parentNode = this; this.children.push(k); } return k; }
    replaceChildren(...ks) { this.children = []; this.append(...ks); }
    closest(sel) { for (let e = this; e; e = e.parentNode) if (MiniEl.is(e, [sel])) return e; return null; }
    querySelectorAll(sel) { const parts = sel.trim().split(/\s+/), out = []; const walk = (e) => { for (const c of e.children) { if (MiniEl.is(c, parts)) out.push(c); walk(c); } }; walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    static one(e, part) {
      const attr = (k) => (k.startsWith('data-') ? e.dataset[k.slice(5).replace(/-(\w)/g, (m, x) => x.toUpperCase())] : e[k] === '' ? undefined : e[k]);
      const m = /^([a-z]+)?/.exec(part); if (m[1] && e.tagName !== m[1].toUpperCase()) return false;
      for (const [, c] of part.matchAll(/\.([\w-]+)/g)) if (!e.className.split(/\s+/).includes(c)) return false;
      for (const [, k, v] of part.replace(/:not\(\[[^\]]+\]\)/g, '').matchAll(/\[([\w-]+)(?:="?([^"\]]*)"?)?\]/g)) { const a = attr(k); if (v === undefined ? a === undefined : String(a) !== v) return false; }
      for (const [, k] of part.matchAll(/:not\(\[([\w-]+)\]\)/g)) if (attr(k) !== undefined) return false;
      return true;
    }
    static is(e, parts) { if (!MiniEl.one(e, parts[parts.length - 1])) return false; let i = parts.length - 2; for (let a = e.parentNode; a && i >= 0; a = a.parentNode) if (MiniEl.one(a, parts[i])) i--; return i < 0; }
  }
  const buildActions = async (name, mutate) => {
    const o = path.join(scratch, name);
    const mut = { name: 'mut', setup(b) { if (mutate) b.onLoad({ filter: /user-todos-actions\.js$/ }, (a) => ({ contents: mutate(fs.readFileSync(a.path, 'utf8')), loader: 'js' })); } };
    await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/user-todos-actions.js')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: o, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug, mut] });
    return import(o);
  };
  const press = async (ACT) => {
    const realMake = document.createElement; document.createElement = (tag) => new MiniEl(tag);
    try {
      const root = new MiniEl('div'), box = new MiniEl('div'), place = new MiniEl('div');
      box.className = 'ut-proposal-card ut-wakeprop'; box.dataset.kind = 'wake'; box.dataset.sig = 'sig-1'; place.className = 'ut-wp-rows'; place.dataset.place = 'piece-7';
      box.append(place); root.append(box);
      const card = { card: { rows: [{ id: 'job-1', name: 'nightly', kind: 'schedule', nextAt: null, grant: false, by: null, owner: { key: 'claude:w0w0', name: 'Worker', self: false } }, { id: 'job-2', name: 'watch', kind: 'job', nextAt: null, grant: false, by: null, owner: { key: 'claude:p0p0', name: 'Manager', self: true } }] } };
      ACT.mountProposalRows(root, () => card);
      ACT.mountProposalRows(root, () => card);   // a second pass mounts nothing twice
      const save = ACT.proposalPressOf(box, 'save'), keep = ACT.proposalPressOf(box, 'keep');
      const ticks = place.querySelectorAll('input[type=checkbox][data-id]');
      const texts = (cls) => { const out = []; const walk = (e) => { for (const c of e.children) { if (String(c.className || '').split(/\s+/).includes(cls)) out.push(c.textContent); walk(c); } }; walk(place); return out; };
      return { save, keep, n: ticks.length, mounted: place.dataset.mounted, head: texts('wake-grant-head').join(''), owners: texts('wake-grant-owner') };
    } finally { document.createElement = realMake; }
  };
  const P = await press(await buildActions('actions.mjs'));
  ok(P.save.drawn === 'sig-1' && P.owners.join('|') === 'wakes «Worker»|wakes «Manager»' && /billed to that conversation/.test(P.head),
    'THE WAKE CARD NAMES WHO WILL BE WOKEN AND SAYS IT COSTS (must 1, law 7): each row its conversation, the head that every resume is a billed turn — and the press carries its drawing', P);
  ok(P.mounted === '1' && P.n === 2 && JSON.stringify(P.save.grant) === '["job-1","job-2"]' && P.keep.grant === null && P.save.terminate.length === 0,
    'ONE PRESS APPROVES on the page: the proposed jobs are drawn ticked through piece 7\'s helper, «Allow the ticked ones» sends them; «Keep all as they are» sends no grant (nothing written)', P);
  const R = await press(await buildActions('actions-red.mjs', (src) => src.replace('.map((r) => ({ ...r, grant: true }))', '.map((r) => ({ ...r, grant: r.grant === true }))')));
  ok(JSON.stringify(R.save.grant) === '[]', 'RED CONTROL: a card drawing the STORED grant (the Terminate door\'s form) would send no job — the one press would approve nothing', R.save);

}

console.log('⑥ THE WORDS — three languages, and never «sleep»');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [...Object.values(EP.CUT_WORDS), 'Terminate selected', 'Keep all', 'Keep all as they are', 'Nothing runs in it.', 'last active {ago}', 'memory {size}', '«{name}» proposes ending {n} conversations', '«{name}» asks that {n} jobs may wake it after it is ended', 'Propose ending conversations to the person', 'Allow the ticked ones', '«{name}» asks that 1 job may wake «{owner}» after it is ended', '«{name}» asks that {n} jobs may wake the conversations they belong to after those are ended', 'wakes «{name}»', '{n} terminated', '{n} could not be terminated', '{n} jobs belong to another conversation now — not written', 'The agent could not be told — tell it in chat.', 'The agent will read it at its next turn.', 'This card changed since you looked at it — read it again, then press', 'answered by you', 'every conversation on it ended'];
  const has = (src, k) => src.includes(JSON.stringify(k) + ':');
  const missing = keys.filter((k) => !has(zh, k) || !has(ja, k));
  ok(missing.length === 0, 'every word the card says has a zh AND a ja row', missing);
  const SLEEP = /sleep|asleep|hibernat|suspend|pause|睡眠|休眠|挂起|暂停|スリープ|休止/i;
  const block = (src) => { const i = src.indexOf('piece 3b): THE PROPOSAL CARD'); return src.slice(i, src.indexOf('\n  // ', i + 10)); };
  const said = [read('src/end-proposal.js'), block(zh), block(ja)].join('\n');
  ok(!SLEEP.test(said), 'NONE of the card\'s words says sleep', said.match(SLEEP));
  ok(SLEEP.test(said + '\nIt is asleep.') && SLEEP.test('它已休眠'), 'RED CONTROL: a planted «asleep» / «休眠» is caught by the same grep');
  ok(FA.ROW_OF['end-proposal'] && FA.ROW_OF['end-proposal'].answer === 'buttons' && FA.ROW_OF['end-proposal'].card === 'row' && FA.ROW_OF['end-proposal'].chat === true, 'the For-you registry row: its own buttons, drawn by the row, answerable in the chat too');
}

console.log('⑧ THE STORE HELD UNREAD (the hold\'s law, 主开发 2026-11-19 05:42Z): the proposal\'s reach judges a target\'s Task Groups as UNKNOWN — refused BY NAME, nothing drawn');
{
  const GH = require(path.join(REPO, 'src/server/groups-hold.js'));
  // the proposer's key reaches the whole VibeSpace EXCEPT the Task Group T-G; the target IS in T-G, but the store is held: its groups read []
  const EXC = [{ door: 'automation-key-reach', resource: 'K-1', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'T-G' }] }];
  const reachExc = (t) => AK.reachVerdict({ keyId: 'K-1', caller: CALLER.conversationId, target: t, reach: 'instance', reachRows: EXC });
  const FACT = ", ...require('./groups-hold.js').fact()";
  const AT = "webuiId: r.id || null, groups: Array.isArray(r.groups) ? r.groups : [], ...lineageFacts(r.groupsUnreadable === true ? null : (Array.isArray(r.groups) ? r.groups : []))" + FACT + " })";   // lane lg-group-parents (restack 415): the row's ancestors ride before the fact
  const w = world(), wr = world({}, (src) => anchored(src, AT, AT.replace(FACT, ''), 'propose-fact-dropped'));   // the RED: the fact dropped
  for (const x of [w, wr]) x.rows.set('claude:aaaa', raw('claude:aaaa'));
  GH.setHeld(() => true);
  let h, red;
  try {
    h = await w.store.propose({ targets: 'claude:aaaa', why: 'idle since yesterday' }, { caller: CALLER, reach: reachExc });
    red = await wr.store.propose({ targets: 'claude:aaaa', why: 'idle since yesterday' }, { caller: CALLER, reach: reachExc });
  } finally { GH.setHeld(() => false); }
  const cards = (x) => x.todos.openItems().filter((i) => i.action && i.action.type === 'end-proposal').length;
  ok(h.ok === false && h.code === 'groups_unreadable' && /Task Groups could not be read just now/.test(h.why || '') && JSON.stringify(h.targets) === '["claude:aaaa"]' && cards(w) === 0,
    'the store HELD: a key reaching «everything except T-G» proposes T-G\'s conversation — refused BY NAME (groups_unreadable, its words, the target named), NO card filed', h);
  ok(red.ok === true && cards(wr) === 1, 'RED CONTROL: the fact dropped — the card is FILED with T-G\'s conversation drawn for the person to terminate (the harm the law exists for)', red);
  const rel = await w.store.propose({ targets: 'claude:aaaa', why: 'idle since yesterday' }, { caller: CALLER, reach: reachExc });
  ok(rel.ok === true && cards(w) === 1, 'CONTROL — the store READ (no hold): the same key proposes it (its groups read [] are real: in no group)', rel);
  w.stop(); wr.stop();
}

CK.report();
