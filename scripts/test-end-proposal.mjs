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
  const ref = CF.refusalOf(CF.endVerdict(CF.shapeRow(raw('claude:bbbb', { background: [{}] }))));
  ok(ref.code === 'subject_busy' && /propose it to the person: vibespace-api conversations propose <target> --why/.test(ref.why), 'THE DOOR: the end verb\'s refusal names the proposal', ref.why);
}

// ── the store over the REAL For-you store ──
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-endprop-'));
process.on('exit', () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { } });
const world = (opts = {}, mutate = null) => {
  const dir = fs.mkdtempSync(path.join(scratch, 'w-'));
  const todos = new UserTodoManager({ dataDir: dir, expirySweepMs: 3600e3 });
  const rows = new Map();
  const listFacts = { list: async () => ({ conversations: [...rows.values()].map((r) => CF.shapeRow(r)) }) };
  const deliver = { stashed: [], wakes: 0, stashFor(cid, env) { this.stashed.push({ cid, ...env }); return { stored: true }; }, deliverToConversation() { this.wakes++; } };
  const ended = [];
  const endConversation = async (target, by) => { ended.push({ target, by }); return { ok: true }; };
  const wrote = [];
  const src = mutate ? mutate(read('src/server/end-proposals.js')) : null;
  let create = require(path.join(REPO, 'src/server/end-proposals.js')).create;
  if (src) { const m = { exports: {} }; new Function('module', 'require', src)(m, createRequire(path.join(REPO, 'src/server/end-proposals.js'))); create = m.exports.create; }
  const store = create({ userTodos: todos, deliver, listFacts, endConversation, liveKeys: () => [...rows.values()].filter((r) => r.state !== 'ended').map((r) => r.key),
    ...(opts.wake === false ? {} : { setWakeGrant: opts.setWakeGrant || (async (id, yes, by) => { if (!by || (by.kind !== 'person' && by.kind !== 'key')) return { error: require(path.join(REPO, 'src/delivery-wake.js')).GRANT_REFUSAL, code: 'wake_grant_person_only' }; wrote.push({ id, yes, by }); return { changed: true }; }) }) });
  return { todos, rows, store, deliver, ended, wrote, stop: () => { try { todos.stop(); } catch { } } };
};
const CALLER = { conversationId: 'p0p0', sessionKey: 'claude:p0p0', name: 'Manager' };
const reach = (o) => (o.conversationId === 'hidden01' ? { ok: false, code: 'not_granted' } : { ok: true });
const openProps = (w) => w.todos.idsWhere((i) => i && i.status === 'open' && EP.isProposal(i.action));

console.log('③ THE STORE — one card per proposer, refreshed; the press judges each row again; the answer is free');
{
  const w = world();
  w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:bbbb', raw('claude:bbbb', { background: [{}, {}] })); w.rows.set('claude:hidden01', raw('claude:hidden01'));
  const ref = CF.refusalOf(CF.endVerdict(CF.shapeRow(w.rows.get('claude:bbbb'))));
  const p1 = await w.store.propose({ targets: ['claude:aaaa', 'claude:bbbb'], why: 'both idle since yesterday; memory is short' }, { caller: CALLER, reach });
  const ids = openProps(w), it = ids.length ? w.todos.get(ids[0]) : null;
  ok(ref.code === 'subject_busy' && p1.ok && ids.length === 1 && it.sessionKey === 'claude:p0p0' && it.card.rows.length === 2 && it.card.rows[0].pick === true && it.card.rows[1].pick === false && it.action.kind === 'end',
    'A REFUSED END FOLLOWED BY A PROPOSAL DRAWS ONE CARD: under the proposer, a row each — the idle one ticked, the busy one not', { p1, rows: it && it.card.rows });
  const p2 = await w.store.propose({ targets: 'claude:aaaa', why: 'only this one now' }, { caller: CALLER, reach });
  const ids2 = openProps(w), it2 = w.todos.get(ids2[0]);
  ok(p2.ok && p2.refreshed === true && ids2.length === 1 && ids2[0] === ids[0] && it2.card.rows.length === 1 && it2.card.why === 'only this one now', 'A SECOND PROPOSAL REFRESHES IT: the same card, its rows and why replaced — never a second card', { p2, ids2 });
  const hidden = await w.store.propose({ targets: ['claude:aaaa', 'claude:hidden01'], why: 'x' }, { caller: CALLER, reach });
  ok(hidden.ok === false && hidden.code === 'not_visible' && /claude:hidden01/.test(hidden.why) && openProps(w).length === 1 && w.todos.get(ids[0]).card.why === 'only this one now', 'A TARGET OUTSIDE WHAT THE KEY SEES is refused BY NAME — nothing filed, the card untouched', hidden);
  const gone = await w.store.propose({ targets: 'claude:zzzz', why: 'x' }, { caller: CALLER, reach });
  ok(gone.ok === false && gone.code === 'not_found' && /claude:zzzz/.test(gone.why), 'a target no row names ⇒ not_found by name', gone);
  w.stop();
}
{
  // THE PRESS: two rows ticked; between the drawing and the press the idle one starts a turn
  const press = async (mutate) => {
    const w = world({}, mutate);
    w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:bbbb', raw('claude:bbbb', { background: [{}, {}] }));
    await w.store.propose({ targets: 'claude:aaaa,claude:bbbb', why: 'both idle' }, { caller: CALLER, reach });
    const id = openProps(w)[0];
    w.rows.set('claude:aaaa', raw('claude:aaaa', { turn: 'running' }));
    const r = await w.store.answer(id, { terminate: ['claude:aaaa', 'claude:bbbb'] }, { kind: 'human', actBy: 'human:local' });
    return { w, id, r };
  };
  const { w, id, r } = await press();
  ok(r.ok && r.terminated.map((x) => x.key).join() === 'claude:bbbb' && r.changed.map((x) => x.key).join() === 'claude:aaaa' && w.ended.length === 1 && w.ended[0].target.backendSessionId === 'bbbb' && w.ended[0].by.kind === 'human',
    'A ROW THAT TURNED BUSY BETWEEN DRAWING AND PRESS IS NOT ENDED; the row the person saw as it is IS (the person\'s own Terminate)', r);
  const it = w.todos.get(id);
  ok(r.open === true && it.status === 'open' && it.card.rows.length === 1 && it.card.rows[0].key === 'claude:aaaa' && it.card.rows[0].changed.includes('turn') && it.card.rows[0].pick === false, 'the card stays, drawn again with what changed (unticked)', it.card.rows);
  ok(w.deliver.stashed.length === 1 && w.deliver.stashed[0].cid === 'p0p0' && w.deliver.stashed[0].fromName === 'VibeSpace proposals' && /terminated: Conv bbbb/.test(w.deliver.stashed[0].text) && /not ended — something started in it after the card was drawn: Conv aaaa/.test(w.deliver.stashed[0].text) && w.deliver.wakes === 0,
    'THE ANSWER REACHES THE PROPOSER WITH NO WAKE: one stash entry for its next turn, never a delivery that wakes it', w.deliver.stashed);
  const trust = await press((src) => src.replace('const pv = EP.pressVerdict(d, nowRow);', "const pv = { verdict: 'end' };"));
  ok(trust.w.ended.length === 2 && trust.w.ended.some((e) => e.target.backendSessionId === 'aaaa'), 'RED CONTROL: a press that trusts the drawn state ends the conversation that started a turn — the leg above would read it', trust.w.ended);
  // ended meanwhile; keep all; the ✕
  w.rows.set('claude:aaaa', raw('claude:aaaa', { state: 'ended' }));
  const r2 = await w.store.answer(id, { terminate: ['claude:aaaa'] }, { kind: 'human', actBy: 'human:local' });
  ok(r2.ok && r2.ended.length === 1 && r2.open === false && w.todos.get(id).status === 'done' && /already ended: Conv aaaa/.test(w.deliver.stashed.at(-1).text), 'one that ENDED meanwhile is said, not an error; the card is answered', r2);
  w.stop();
}
{
  const w = world();
  w.rows.set('claude:aaaa', raw('claude:aaaa')); w.rows.set('claude:bbbb', raw('claude:bbbb'));
  await w.store.propose({ targets: 'claude:aaaa,claude:bbbb', why: 'idle' }, { caller: CALLER, reach });
  const id = openProps(w)[0];
  const k = await w.store.answer(id, { terminate: [] }, { kind: 'human', actBy: 'human:local' });
  ok(k.ok && k.kept.length === 2 && w.ended.length === 0 && w.todos.get(id).status === 'done' && /kept: Conv aaaa \(claude:aaaa\), Conv bbbb/.test(w.deliver.stashed.at(-1).text), '«Keep all»: nothing ended, the card answered, the proposer told');
  await w.store.propose({ targets: 'claude:aaaa', why: 'again' }, { caller: CALLER, reach });
  const id2 = openProps(w)[0];
  ok(id2 && id2 !== id, 'after an answer, the next proposal is a NEW card (the answered one stays answered)');
  w.todos.setStatus(id2, 'dismissed', 'user');
  ok(/kept: Conv aaaa/.test(w.deliver.stashed.at(-1).text) && w.deliver.wakes === 0, 'the card\'s ✕ keeps every row — the proposer hears that too, free');
  await w.store.propose({ targets: 'claude:aaaa,claude:bbbb', why: 'third' }, { caller: CALLER, reach });
  const id3 = openProps(w)[0];
  w.rows.set('claude:aaaa', raw('claude:aaaa', { state: 'ended' }));
  ok(await w.store.sweep() === 0 && w.todos.get(id3).status === 'open', 'the sweep: one row still live ⇒ the card stays');
  w.rows.set('claude:bbbb', raw('claude:bbbb', { state: 'ended' }));
  ok(await w.store.sweep() === 1 && w.todos.get(id3).status === 'done' && w.ended.length === 0, 'NO CLOCK: the card resolves when every conversation on it has ended — and nothing on it was ended by the card');
  w.stop();
}

console.log('④ THE SECOND KIND — the wake grant piece 7 proposes (proposeWakeGrant, over piece 7\'s own rows)');
{
  // a stand-in for piece 7's in-process door with ITS rule (src/jobs.js setWakeGrant: only a person's or a key's act writes)
  const GRANT_REFUSAL = require(path.join(REPO, 'src/delivery-wake.js')).GRANT_REFUSAL;
  const w = world();
  const R7 = (id, name, more = {}) => ({ id, name, kind: 'job', nextAt: null, grant: false, by: null, ...more });   // piece 7's wakeChoiceRows shape
  const JOBS = [R7('job-1', 'nightly report', { kind: 'schedule', nextAt: Date.now() + 3600e3 }), R7('job-2', 'watch', { grant: true, by: { kind: 'person', name: null, at: 5 } })];
  const p = w.store.proposeWakeGrant(CALLER, { rows: JOBS, why: 'their results matter after I am ended' });
  const ids = openProps(w), it = w.todos.get(ids[0]);
  ok(p.ok && p.id === ids[0] && ids.length === 1 && it.action.kind === 'wake' && it.card.rows.length === 2 && it.card.rows[0].nextAt > Date.now() && it.card.rows[0].kind === 'schedule' && it.card.rows[1].grant === true && it.card.rows[1].by.kind === 'person',
    'it files ONE wake card under the proposer (its own kind — proposes no end), the rows in piece 7\'s own shape; the answer carries the card\'s id (piece 7 reads r.id)', { p, rows: it && it.card.rows });
  const p2 = w.store.proposeWakeGrant(CALLER, { rows: [JOBS[0]], why: 'just the report' });
  const it2 = w.todos.get(ids[0]);
  ok(p2.refreshed === true && openProps(w).length === 1 && it2.card.rows.length === 2 && it2.card.rows.filter((r) => r.id === 'job-1').length === 1 && it2.card.why === 'just the report',
    'a job already on the card is REFRESHED in place — never a second card, never a second row for it (one card per proposer and job)', it2.card);
  const p3 = w.store.proposeWakeGrant(CALLER, { rows: [R7('job-3', 'digest')], why: 'the digest too' });
  ok(p3.refreshed === true && openProps(w).length === 1 && w.todos.get(ids[0]).card.rows.map((r) => r.id).join() === 'job-2,job-1,job-3', 'a NEW job joins the same card — the person sees one card per proposer, never a flood', w.todos.get(ids[0]).card.rows.map((r) => r.id));
  const other = w.store.proposeWakeGrant({ conversationId: 'q1q1', sessionKey: 'claude:q1q1', name: 'Other' }, { rows: [R7('job-9', 'theirs')], why: 'mine' });
  ok(other.ok && other.id !== ids[0] && openProps(w).length === 2, 'another proposer gets its own card');
  w.todos.setStatus(other.id, 'dismissed', 'user');
  const keep = await w.store.answer(ids[0], { terminate: [], wakeTicks: [] }, { kind: 'human', actBy: 'human:local' });
  ok(keep.ok && w.wrote.length === 0 && keep.unchanged.length === 3 && /kept as they were: watch \(job-2\), nightly report \(job-1\), digest \(job-3\)/.test(w.deliver.stashed.at(-1).text),
    '«Keep all as they are» (no grant sent) WRITES NOTHING — not even the stored grant it drew; the proposer told, free', { keep, said: w.deliver.stashed.at(-1) });
  w.store.proposeWakeGrant(CALLER, { rows: JOBS, why: 'both' });
  const id2 = openProps(w)[0];
  const g = await w.store.answer(id2, { grant: ['job-1', 'job-2'] }, { kind: 'human', actBy: 'human:local' });
  ok(g.ok && w.wrote.length === 1 && w.wrote[0].id === 'job-1' && w.wrote[0].yes === true && w.wrote[0].by.kind === 'person' && w.todos.get(id2).status === 'done' && w.deliver.wakes === 0 && /may now wake their conversation after it is ended: nightly report \(job-1\)/.test(w.deliver.stashed.at(-1).text),
    'ONE PRESS APPROVES: the ticked job whose stored grant differs is written through piece 7\'s person door as the PERSON (once per changed row only); the answer is free', { g, wrote: w.wrote });
  w.store.proposeWakeGrant(CALLER, { rows: JOBS, why: 'again' });
  const id3 = openProps(w)[0], before = w.wrote.length;
  const notPerson = await w.store.answer(id3, { grant: ['job-1'] }, { kind: 'agent', by: 'vsst' });
  ok(notPerson.ok === false && notPerson.code === 'wake_grant_person_only' && notPerson.why === GRANT_REFUSAL && w.wrote.length === before && w.todos.get(id3).status === 'open',
    'RED CONTROL: a press that is NOT the person\'s reaches piece 7\'s door as nobody — refused there by name, nothing written, the card stays', notPerson);
  w.stop();
  const n = world({ wake: false });
  n.store.proposeWakeGrant(CALLER, { rows: [JOBS[0]], why: 'x' });
  const nid = openProps(n)[0];
  const nr = await n.store.answer(nid, { grant: ['job-1'] }, { kind: 'human', actBy: 'human:local' });
  ok(nr.ok === false && nr.code === 'not_ready' && n.todos.get(nid).status === 'open', 'without piece 7\'s door nothing is written and the card stays (said by name)', nr);
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
  const jw = read('src/server/jobs-wiring.js'), mp = read('src/server/mounts-plugins-wiring.js'), ar = read('src/agent-routes.js');
  ok(/const setWakeGrant = \(jobId, yes, by\) => \{ const job = jm\.jobs\.get\(String\(jobId \|\| ''\)\); return job \? jm\.setWakeGrant\(job, yes === true, \{ by \}\) : \{ error: 'no such job', code: 'not_found' \}; \};/.test(jw)
    && /setProposalDoor: \(fn\) => \{ jm\.proposeWakeDoor = typeof fn === 'function' \? fn : null; \}/.test(jw)
    && /jobsWiring\.setProposalDoor\(\(caller, a\) => endProposals\.proposeWakeGrant\(caller, a\)\)/.test(mp) && /jobsWiring\.setWakeGrant\(jobId, yes, by\)/.test(mp)
    && /door\(\{ sessionKey: cid \? `\$\{s\.backend \|\| 'claude'\}:\$\{cid\}` : null, conversationId: cid, name: s\.name \|\| null \}, \{ rows: a\.jm\.wakeRowsOf\(\[target\]\), why: text \}\)/.test(ar) && /r\.id \? \{ proposal: r\.id \}/.test(ar),
    'the hub binds the card to piece 7: the propose door (jobs-wiring setProposalDoor ⇐ the store\'s proposeWakeGrant, called with jm.wakeRowsOf) and the person\'s writes through jobs-wiring\'s own in-process door');
  const run = (mutate) => {
    const w = world({ setWakeGrant: wiringDoor }, mutate);
    jm.proposeWakeDoor = (caller, a) => w.store.proposeWakeGrant(caller, a);
    const caller = { sessionKey: 'claude:p0p0', conversationId: 'p0p0', name: 'Manager' };
    const r1 = jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([A]), why: 'the digest reaches it after an end' });
    const r2 = jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([A]), why: 'the digest, again' });
    const r3 = jm.proposeWakeDoor(caller, { rows: jm.wakeRowsOf([B]), why: 'and the report' });
    return { w, r1, r2, r3, cards: openProps(w) };
  };
  // a plain agent's direct write stays refused by name, and the refusal names the propose door
  const direct = jm.setWakeGrant(A, true, { by: null });
  const namesDoor = (s) => /vibespace-job propose-wake <id>/.test(String(s || ''));
  ok(direct.code === 'wake_grant_person_only' && direct.error === DW.GRANT_REFUSAL && namesDoor(direct.error) && A[DW.GRANT_FIELD] !== true,
    'A PLAIN AGENT\'S DIRECT WRITE stays refused BY NAME — and the refusal names the propose door', direct);
  ok(!namesDoor(DW.GRANT_REFUSAL.replace(/; or propose it[^']*$/, '')), 'RED CONTROL: the refusal without its last clause would fail the leg above (it names no propose door)');
  const { w, r1, r2, r3, cards } = run();
  const card = cards.length ? w.todos.get(cards[0]) : null;
  ok(r1.ok && r1.id && r2.id === r1.id && r3.id === r1.id && cards.length === 1 && card.card.rows.map((r) => r.id).sort().join() === [A.id, B.id].sort().join() && card.card.rows.every((r) => r.grant === false && typeof r.name === 'string'),
    'THE BOUND PROPOSAL DOOR: piece 7\'s propose verb ends at ONE card per proposer — the same job proposed twice is refreshed, not multiplied; another job joins it', { r1, r2, r3, rows: card && card.card.rows });
  const dup = run((src) => src.replace('const itemKey = open ? open.itemKey : `wake-proposal:', 'const itemKey = false ? open.itemKey : `wake-proposal:'));
  const dupRows = run((src) => src.replace('[...had.filter((r) => r && !ids.has(r.id)), ...fresh]', '[...had, ...fresh]'));
  ok(dup.cards.length === 3 && dupRows.cards.length === 1 && dupRows.w.todos.get(dupRows.cards[0]).card.rows.length === 3,
    'RED CONTROL: a store that files every proposal under a new key draws three cards; one that appends without the job\'s identity doubles the job\'s row — the leg above would read both', { cards: dup.cards.length, rows: dupRows.w.todos.get(dupRows.cards[0]).card.rows.map((r) => r.id) });
  const notYou = await w.store.answer(cards[0], { grant: [A.id, B.id] }, { kind: 'agent', by: 'vsst' });
  ok(notYou.ok === false && notYou.code === 'wake_grant_person_only' && A[DW.GRANT_FIELD] !== true && B[DW.GRANT_FIELD] !== true && w.todos.get(cards[0]).status === 'open',
    'RED CONTROL: the same press arriving as anything but the person\'s act is refused by piece 7\'s engine by name — nothing written', notYou);
  const yes = await w.store.answer(cards[0], { grant: [A.id, B.id] }, { kind: 'human', actBy: 'human:local' });
  ok(yes.ok && A[DW.GRANT_FIELD] === true && B[DW.GRANT_FIELD] === true && A.wakeGrantBy.kind === 'person' && jm.wakeGrantOf(A.id).granted === true && w.todos.get(cards[0]).status === 'done' && w.deliver.wakes === 0 && /may now wake their conversation after it is ended/.test(w.deliver.stashed.at(-1).text),
    'THE APPROVAL IS THE PERSON\'S PRESS through the jobs wiring\'s own door: both jobs carry the person\'s grant (the engine records the person); the card answered; the proposer reads it at its next turn, free', { yes, A: [A[DW.GRANT_FIELD], A.wakeGrantBy] });
  for (const x of [w, dup.w, dupRows.w]) x.stop();
  try { jm.shutdown(); } catch { }
}

console.log('⑤ THE PERSON-ONLY DOOR (src/routes/end-proposals.js)');
{
  const routes = {};
  const app = { post: (p, fn) => { routes[p] = fn; } };
  let asked = 0;
  require(path.join(REPO, 'src/routes/end-proposals.js')).registerEndProposalRoutes(app, { proposals: { answer: async () => { asked++; return { ok: true }; } } });
  const res = () => { const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; return r; };
  const r1 = res();
  await routes['/api/end-proposals/:id/answer']({ headers: { authorization: 'Bearer vsst_' + 'x'.repeat(20) }, params: { id: 'ut-1' }, body: { terminate: ['claude:aaaa'] } }, r1);
  ok(r1.code === 403 && r1.body.code === 'person_only' && asked === 0, 'a bearer (an agent, a job, a key) is refused BY NAME — the press never reaches the store', r1.body);
  const r2 = res();
  await routes['/api/end-proposals/:id/answer']({ headers: { host: 'hub.test' }, params: { id: 'ut-1' }, body: { terminate: [] } }, r2);
  const r3 = res();
  let pressedSeen = null;
  require(path.join(REPO, 'src/routes/end-proposals.js')).registerEndProposalRoutes(app, { proposals: { answer: async (id, body, by, o) => { asked++; pressedSeen = { by, pressed: !!(o && o.pressed) }; return { ok: true }; } } });
  await routes['/api/end-proposals/:id/answer']({ headers: { host: 'hub.test', 'sec-fetch-site': 'same-origin' }, params: { id: 'ut-1' }, body: { terminate: [] }, socket: {} }, r3);
  ok(r2.code === 403 && r2.body.code === 'person_only' && /no mark of this page/.test(r2.body.why) && r3.code === 200 && asked === 1 && pressedSeen.pressed === true && pressedSeen.by.kind === 'human',
    'a request with no mark of this page is refused too; the person\'s press on the page reaches the store carrying a minted press, as the person (RED CONTROL for both refusals)', { r2: r2.body, r3: r3.body, pressedSeen });
  const src = read('src/routes/end-proposals.js');
  ok(/const pressed = bearer \? null : WO\(\)\.pressOf\(req\);/.test(src) && /kind: 'human', actBy: require\('\.\.\/device-audit\.js'\)\.byOfReq\(req\)/.test(src), 'the door asks the strict press verdict (piece 7\'s person rule) and answers as the person (the person\'s own Terminate)');
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
      box.className = 'ut-proposal-card ut-wakeprop'; box.dataset.kind = 'wake'; place.className = 'ut-wp-rows'; place.dataset.place = 'piece-7';
      box.append(place); root.append(box);
      const card = { card: { rows: [{ id: 'job-1', name: 'nightly', kind: 'schedule', nextAt: null, grant: false, by: null }, { id: 'job-2', name: 'watch', kind: 'job', nextAt: null, grant: false, by: null }] } };
      ACT.mountProposalRows(root, () => card);
      ACT.mountProposalRows(root, () => card);   // a second pass mounts nothing twice
      const save = ACT.proposalPressOf(box, 'save'), keep = ACT.proposalPressOf(box, 'keep');
      const ticks = place.querySelectorAll('input[type=checkbox][data-id]');
      return { save, keep, n: ticks.length, mounted: place.dataset.mounted };
    } finally { document.createElement = realMake; }
  };
  const P = await press(await buildActions('actions.mjs'));
  ok(P.mounted === '1' && P.n === 2 && JSON.stringify(P.save.grant) === '["job-1","job-2"]' && P.keep.grant === null && P.save.terminate.length === 0,
    'ONE PRESS APPROVES on the page: the proposed jobs are drawn ticked through piece 7\'s helper, «Allow the ticked ones» sends them; «Keep all as they are» sends no grant (nothing written)', P);
  const R = await press(await buildActions('actions-red.mjs', (src) => src.replace('.map((r) => ({ ...r, grant: true }))', '.map((r) => ({ ...r, grant: r.grant === true }))')));
  ok(JSON.stringify(R.save.grant) === '[]', 'RED CONTROL: a card drawing the STORED grant (the Terminate door\'s form) would send no job — the one press would approve nothing', R.save);

}

console.log('⑥ THE WORDS — three languages, and never «sleep»');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [...Object.values(EP.CUT_WORDS), 'Terminate selected', 'Keep all', 'Keep all as they are', 'Nothing runs in it.', 'last active {ago}', 'memory {size}', '«{name}» proposes ending {n} conversations', '«{name}» asks that {n} jobs may wake it after it is ended', 'Propose ending conversations to the person', 'Allow the ticked ones', 'Saved — the agent will read it at its next turn', 'Kept as they are — the agent will read it at its next turn'];
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
