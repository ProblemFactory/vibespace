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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info.slice(0, 900) : JSON.stringify(info).slice(0, 900)); } };
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
  const setW = opts.setWakeGrant || (async (id, yes, by) => { if (!by || (by.kind !== 'person' && by.kind !== 'key')) return { error: GRANT_REFUSAL, code: 'wake_grant_person_only' }; if (!owners.has(id)) return { error: 'no such job', code: 'not_found' }; wrote.push({ id, yes, by }); return { changed: true }; });
  let create = require(path.join(REPO, 'src/server/end-proposals.js')).create;
  if (mutate) create = loadMutated('src/server/end-proposals.js', mutate).create;
  const store = create({ userTodos: todos, deliver, listFacts, endConversation,
    liveKeys: () => [...rows.values()].filter((r) => r.key && r.state !== 'ended').map((r) => r.key),
    endedKeys: async () => [...rows.values()].filter((r) => r.key && r.state === 'ended').map((r) => r.key),   // THE FACT: a stopped record
    jobOwnerOf: (id) => (owners.has(id) ? { key: owners.get(id), cid: owners.get(id).slice(owners.get(id).indexOf(':') + 1) } : null),
    ...(opts.wake === false ? {} : { setWakeGrant: setW, storeWakeTicks: async (ticks, by) => { for (const x of ticks || []) { const r = await setW(x.id, x.grant === true, by); if (r && r.error) throw new Error(r.error); } } }) });
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
  const t1r = await ticked({}, (src) => src.replace("const mine = ticks.filter((x) => x && typeof x.id === 'string' && typeof jobOwnerOf === 'function' && (jobOwnerOf(x.id) || {}).key === d.key)", "const mine = ticks.filter((x) => x && typeof x.id === 'string')"));
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
  const br = await belted((src) => src.replace("if (r.state === 'ended') { ended.push(line(r.name || r.key)); continue; }", "if (r.state === 'ended') { ended.push(r.name || r.key); continue; }"));
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
  const mvr = await moved((src) => src.replace('      if (r.owner && o.key !== r.owner.key) { out.moved.push(r); continue; }\n', ''));
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
  const wiringDoor = (jobId, yes, by) => { const job = jm.jobs.get(String(jobId || '')); return job ? jm.setWakeGrant(job, yes === true, { by }) : { error: 'no such job', code: 'not_found' }; };
  const wiringOwner = (jobId) => { const j = jm.jobs.get(String(jobId || '')); const t = j && j.cronParent ? (jm.jobs.get(j.cronParent) || j) : j; const cid = t && t.owner && t.owner.conversation && t.owner.conversation.id; return cid ? { key: `claude:${cid}`, cid } : null; };
  const jw = read('src/server/jobs-wiring.js'), mp = read('src/server/mounts-plugins-wiring.js'), ar = read('src/agent-routes.js');
  ok(/const setWakeGrant = \(jobId, yes, by\) => \{ const job = jm\.jobs\.get\(String\(jobId \|\| ''\)\); return job \? jm\.setWakeGrant\(job, yes === true, \{ by \}\) : \{ error: 'no such job', code: 'not_found' \}; \};/.test(jw)
    && /setProposalDoor: \(fn\) => \{ jm\.proposeWakeDoor = typeof fn === 'function' \? fn : null; \}/.test(jw)
    && /jobsWiring\.setProposalDoor\(\(caller, a\) => endProposals\.proposeWakeGrant\(caller, a\)\)/.test(mp) && /jobsWiring\.setWakeGrant\(jobId, yes, by\)/.test(mp)
    && /jobOwnerOf: \(jobId\) => \{ const jm = jobsWiring && typeof jobsWiring\.getJobs === 'function' \? jobsWiring\.getJobs\(\) : null; const j = jm && jm\.jobs \? jm\.jobs\.get\(String\(jobId \|\| ''\)\) : null; const t = j && j\.cronParent \? \(jm\.jobs\.get\(j\.cronParent\) \|\| j\) : j; const cid = t && t\.owner && t\.owner\.conversation && t\.owner\.conversation\.id;/.test(mp)
    && /door\(\{ sessionKey: cid \? `\$\{s\.backend \|\| 'claude'\}:\$\{cid\}` : null, conversationId: cid, name: s\.name \|\| null \}, \{ rows: a\.jm\.wakeRowsOf\(\[target\]\), why: text \}\)/.test(ar) && /r\.id \? \{ proposal: r\.id \}/.test(ar),
    'the hub binds the card to piece 7: the propose door (jobs-wiring setProposalDoor ⇐ the store\'s proposeWakeGrant, called with jm.wakeRowsOf) and the person\'s writes through jobs-wiring\'s own in-process door');
  const run = async (mutate) => {
    const w = world({ setWakeGrant: wiringDoor }, mutate);
    w.store = (mutate ? loadMutated('src/server/end-proposals.js', mutate) : require(path.join(REPO, 'src/server/end-proposals.js'))).create({ userTodos: w.todos, deliver: w.deliver, listFacts: { list: async () => ({ conversations: [] }) }, endConversation: async () => ({ ok: true }), setWakeGrant: wiringDoor, jobOwnerOf: wiringOwner });
    jm.proposeWakeDoor = (caller, a) => w.store.proposeWakeGrant(caller, a);
    const caller = { sessionKey: 'claude:p0p0', conversationId: 'p0p0', name: 'Manager' };
    const r1 = await jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([A]), why: 'the digest reaches it after an end' });
    const r2 = await jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([A]), why: 'the digest, again' });
    const r3 = await jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([B]), why: 'and the report' });
    return { w, r1, r2, r3, cards: openProps(w) };
  };
  // a plain agent's direct write stays refused by name, and the refusal names the propose door
  const direct = jm.setWakeGrant(A, true, { by: null });
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
    const gw = world({ setWakeGrant: wiringDoor }, mutate);
    gw.store = (mutate ? loadMutated('src/server/end-proposals.js', mutate) : require(path.join(REPO, 'src/server/end-proposals.js'))).create({ userTodos: gw.todos, deliver: gw.deliver, listFacts: { list: async () => ({ conversations: [] }) }, endConversation: async () => ({ ok: true }), setWakeGrant: wiringDoor, jobOwnerOf: wiringOwner });
    const p = await gw.store.proposeWakeGrant({ sessionKey: 'claude:p0p0', conversationId: 'p0p0', name: 'Gone test' }, { rows: jm.wakeRowsOf([Cj, Dj]), why: 'both' });
    hush(() => jm.rm(Dj, { stop: true }));
    const r = await press(gw, p.id, { grant: [Cj.id, Dj.id] });
    return { r, gw, Cj, Dj, status: gw.todos.get(p.id).status, said: (gw.deliver.stashed.at(-1) || {}).text || '' };
  };
  const g1 = await goneRun();
  ok(g1.r.ok && g1.Cj[DW.GRANT_FIELD] === true && g1.r.gone.length === 1 && g1.r.gone[0].id === g1.Dj.id && g1.status === 'done' && /no longer exist \(removed since the card was drawn\)/.test(g1.said),
    'A JOB REMOVED between the drawing and the press: the rest still land, the gone one is said to the proposer — the card is answered', { r: g1.r, said: g1.said });
  const g2 = await goneRun((src) => src.replace("      if (!o) { out.gone.push(r); continue; }\n", '').replace('      if (r.owner && o.key !== r.owner.key)', '      if (o && r.owner && o.key !== r.owner.key)').replace("      if (w && w.code === 'not_found') { out.gone.push(r); continue; }\n", ''));
  ok(g2.status === 'open' && g2.r.refused.length === 1 && g2.r.gone.length === 0, 'RED CONTROL: a store that does not tell a gone job from a refusal leaves the card open on a job that no longer exists — the leg above would read it', g2.r);
  for (const x of [w, dup.w, dupRows.w, g1.gw, g2.gw]) x.stop();
  try { jm.shutdown(); } catch { }
}

console.log('⑤ THE PERSON-ONLY DOOR (src/routes/end-proposals.js) — through the real app stack: express, its JSON body, the route, over HTTP');
{
  const express = createRequire(path.join(REPO, 'package.json'))('express');
  const http = require('node:http');
  const serve = async (mutate) => {
    const app = express(); app.use(express.json());
    const seen = [];
    const R = mutate ? loadMutated('src/routes/end-proposals.js', mutate) : require(path.join(REPO, 'src/routes/end-proposals.js'));
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

console.log(fail ? `✗ test-end-proposal: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
