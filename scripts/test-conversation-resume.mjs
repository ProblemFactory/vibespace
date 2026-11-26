#!/usr/bin/env node
// test-conversation-resume.mjs — the manager design's piece 4 (主开发 2026-11-17): THE VERB conversations.resume. An automation key
// resumes an ENDED conversation within its reach the way a person's Resume press does — the page's own resume road run headless
// (src/server/inbox-reopen.js reopen, through the hub's one line, src/server/resume-line.js) — and NOTHING is sent into it and
// NOTHING is billed. A resume nobody pressed must not start a turn nobody pressed (主开发 02:23Z): from the conversation's KEPT RECORD
// it refuses by name an active goal, a CLI timer mark, and — on a harness whose resume continues a goal by itself — a goal the
// record cannot speak for. In-process: the REAL conversation-ops verbs and seam, the REAL inbox-reopen, the REAL line and the REAL
// spend guard on this run's scratch data; the create case is a stand-in that starts a fake CLI and records every input frame it
// is handed. No hub, no real CLI, no billed turn.
//   ① END, THEN RESUME — live again; the fake CLI received ZERO input frames; the spend ledger has NO new row.
//      CONTROL: one conversations.open in the same world adds ONE automation-open row (the probe sees a billed create).
//      RED CONTROL: a mutant copy of the resume road whose create carries a first message ⇒ the fake CLI receives it.
//   ② refused by name, nothing created: not ended · out of reach · not found · archived · a harness or a window that needs a page
//      (RED CONTROL: the same record in a chat window resumes)
//   ③ THE KEPT RECORD: goal_active · timer_marked · goal_unknown on a harness that continues a goal by itself — RED CONTROL: that
//      harness's row read as 'nothing' resumes the same record; Claude's row resumes an unknown goal; the real capability rows
//   ④ THE LINE IN THE VERB: the third waits (queued, its place) and starts when one ENDED; the eleventh waiting resume of one key ⇒
//      line_full with the count; the same conversation twice ⇒ one create; a person's resume racing it ⇒ `already`; a create
//      that answers an error ⇒ resume_failed with its own words; the line starts only once the boot ADOPTED the live sessions
//      (CONTROL: no gate ⇒ the create runs at once)
//   ⑤ the kept-record facts (keptFacts) over a record and its wrapper's sidecar
//   ⑦ THE RECORD OF THE LAST END, READ (主开发 14:51Z: piece 3 WRITES it, piece 4 reads and judges) — records in the contract's shape
//      read back through a REAL boot-restore's keptRecordOf: codex with a stated none and a queue READ empty resumes; an active goal,
//      a terminal window, a read queue with two, an unstated goal are refused by name; a queue the record does not say was read is
//      refused on a row that runs one by itself (queue_unknown — RED: the same record with queueRead resumes) and not on claude; a
//      restart's sidecar counts its queue only with the read's mark
//   ⑧ the new-harness checklist asks every descriptor's capability row for resumeContinues (RED: the codex row without it)
//   ⑥ the wiring: the line's road and boot gate, the harness rows, the scope row (not billed), the CLI verb, and no spend in the verb's road
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const { ok, counts } = checker();   // B-119d: THE ONE checker (scripts/lib/check.mjs) — a condition is a boolean, a name a string, else it throws
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const OPS = require(path.join(REPO, 'src/server/conversation-ops.js'));
const IR = require(path.join(REPO, 'src/server/inbox-reopen.js'));
const RL = require(path.join(REPO, 'src/server/resume-line.js'));
const SG = require(path.join(REPO, 'src/server/spend-guard.js'));
const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
const { harnessRowOf } = require(path.join(REPO, 'src/resume-line.js'));
const DIR = scratch('conv-resume');
fs.mkdirSync(DIR, { recursive: true });

// the open spec's tables for the ONE billed control (a conversations.open of claude) — not a list of every harness
const TABLES = { backends: ['claude'], chatBackends: ['claude'], byBackend: {
  claude: { models: ['opus'], modelFree: true, efforts: ['high'], effortFree: true, permissionModes: ['auto', 'bypassPermissions', 'plan', 'acceptEdits'] } } };
const CHAT = { goal: 'none', queue: 0, timerMark: null, mode: 'chat', cwd: '/w/proj', hostId: null, kept: true };   // a goal stated none, a queue READ empty

/** THE SPEND LEDGER as the real guard keeps it: every stamp (the instance's, each identity's, the attended presses) + the disk copy */
const ledger = (W) => { const b = W.guard.snapshot().budget; return { instance: b.instance.length, identities: Object.values(b.identities).reduce((n, a) => n + a.length, 0), attended: (b.attended || []).length, reasons: b.instance.map((s) => s.reason) }; };
const rows = (L) => L.instance + L.identities + L.attended;

let nW = 0;
/** One world: the real verbs, seam, reopen road, line and spend guard; `answer` = what the stand-in create answers. */
function world({ ir = IR, facts = {}, archived = [], reachable = null, rowOf = (b) => harnessRowOf(capsOf(b)), answer = 'created', hold = false, ready = null, layouts = null } = {}) {
  const dataDir = path.join(DIR, 'w' + (++nW));
  fs.mkdirSync(dataDir, { recursive: true });
  const W = { dataDir, creates: [], cli: new Map(), activeSessions: new Map(), ended: new Map(), gates: [] };
  W.guard = SG.create({ dataDir });
  let seq = 0;
  // THE STAND-IN CREATE CASE (src/ws-create.js handleCreate's contract): it starts a fake CLI on the conversation (a resume keeps
  // its id) and hands it a first input frame only when the create message carries one (`initialPrompt` — ws-create's field)
  W.handleCreate = async (ws, data) => {
    W.creates.push({ data, ws });
    if (hold) await new Promise((r) => W.gates.push(r));
    if (answer === 'already') { const old = [...W.activeSessions.keys()].find((k) => W.activeSessions.get(k).backendSessionId === data.resumeId); ws.send(JSON.stringify({ type: 'error', code: 'resume-already-live', existingId: old, reqId: data.reqId, message: 'already live' })); return; }
    if (answer === 'error') { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'Account error: the account cannot serve' })); return; }
    const id = 'sess-' + (++seq);
    const conv = data.resume ? data.resumeId : 'new-' + seq;
    const cli = { inputs: [] };
    if (data.initialPrompt) cli.inputs.push(data.initialPrompt);
    W.cli.set(id, cli);
    W.activeSessions.set(id, { name: data.sessionName || null, cwd: data.cwd, mode: data.mode, backend: data.backend || 'claude', backendSessionId: conv, claudeSessionId: conv, clients: new Map([[ws, {}]]), write: (d) => cli.inputs.push(d) });
    ws.send(JSON.stringify({ type: 'created', sessionId: id, name: data.sessionName || null, reqId: data.reqId }));
  };
  W.endSession = async (d, o) => { const had = W.activeSessions.delete(d.sessionId); o.reply({ type: 'killed', sessionId: d.sessionId, ok: had }); };
  W.ops = OPS.forDeps({ handleCreate: W.handleCreate, spendGuard: W.guard, activeSessions: W.activeSessions, endSession: W.endSession, specTables: () => TABLES,
    getSessionKey: (s) => (s.backendSessionId ? `${s.backend || 'claude'}:${s.backendSessionId}` : ''), WS_OPEN: 1 });
  W.reopen = ir.create({ getOpenConversation: () => W.ops.openConversation, activeSessions: W.activeSessions, discover: async (key) => ({ cwd: '/w/proj', sessionKey: key }),
    defaultsFor: () => ({ permission: 'default', extraArgs: '' }), log: () => { } });
  W.line = RL.createResumeLine({ start: RL.startThrough({ reopen: (item, o) => W.reopen.reopen(item, o) }), ready, log: () => { } });
  W.verbs = OPS.automationVerbs({ activeSessions: W.activeSessions, ops: W.ops, waitMs: 0, resumeLine: W.line, resumeFactsOf: (k) => facts[k] || null,
    isArchived: (k) => archived.includes(k), resumeRowOf: rowOf, deadOf: (t) => W.ended.get(t) || null,
    ...(layouts ? { rowDesktopOf: (k) => require(path.join(REPO, 'src/resume-line.js')).rowDesktopOf(layouts, k) } : {}) });
  W.ctx = (keyId = 'ak1') => ({ caller: { conversationId: 'mgr-1', sessionKey: 'claude:mgr-1', groups: [] }, keyId,
    reach: (t) => (!reachable || reachable.includes(t.conversationId)) ? { ok: true } : { ok: false, code: 'not_granted', why: 'the key does not reach that conversation' } });
  W.resume = (target, keyId) => W.verbs['conversations.resume']({ target }, W.ctx(keyId));
  /** an ENDED conversation the stores still name (the real deadOf reads user-state + the Task Groups) */
  W.endedOne = (key, name = null) => { const id = key.slice(key.indexOf(':') + 1); W.ended.set(key, { conversationId: id, sessionKey: key, name, groups: [] }); return key; };
  W.inputs = () => [...W.cli.values()].reduce((n, c) => n + c.inputs.length, 0);
  W.release = async () => { for (let k = 0; k < 40 && W.gates.length; k++) { W.gates.shift()(); await tick(1); } };
  return W;
}

console.log('— ① END, THEN RESUME: live again, nothing sent, nothing billed');
{
  const W = world({ facts: { 'claude:c-1': CHAT } });
  // a person's conversation, live: the page's own create (the ws case), then the key ENDS it (conversations.end)
  await W.ops.openConversation({ type: 'create', backend: 'claude', mode: 'chat', cwd: '/w/proj', resume: true, resumeId: 'c-1', cols: 120, rows: 30 }, { kind: 'human', actBy: 'human:me' }, { ws: IR.headlessCreator('human:me'), attachedSessions: new Set() });
  const live0 = [...W.activeSessions.values()].some((s) => s.backendSessionId === 'c-1');
  // a person's Terminate through the end seam (the agent's end verb now asks piece 3's facts first — not this leg's subject)
  const liveId = [...W.activeSessions].find(([, x]) => x.backendSessionId === 'c-1')[0];
  const answers = [];
  await W.ops.endConversation({ sessionId: liveId }, { kind: 'human', actBy: 'human:me' }, { reply: (m) => answers.push(m) });
  W.endedOne('claude:c-1', 'the build worker');
  const gone = ![...W.activeSessions.values()].some((s) => s.backendSessionId === 'c-1');
  ok(!!live0 && !!gone && answers.some((m) => m && m.ok), `the conversation was live, then a person ended it (${JSON.stringify(answers)})`);
  const before = ledger(W), inputs0 = W.inputs(), creates0 = W.creates.length;
  const r = await W.resume('claude:c-1');
  const s = r.sessionId ? W.activeSessions.get(r.sessionId) : null;
  const made = W.creates[creates0];
  ok(!!r.ok && !!s && s.backendSessionId === 'c-1' && W.creates.length === creates0 + 1, `① resumed: LIVE AGAIN as ${r.sessionId} on the same conversation (c-1), one create`, r);
  ok(!!made && made.data.resume === true && made.data.resumeId === 'c-1' && made.data.mode === 'chat' && made.data.cwd === '/w/proj' && !made.data.initialPrompt, '① the create is the page\'s own resume of c-1 (the resume road\'s message, no first message)', made && made.data);
  ok(!!made && made.ws._headless === true && made.ws._actBy === 'automation:ak1' && !s.clients.has(made.ws), '① …from a HEADLESS creator naming the key, which left the session the moment it answered', made && { h: made.ws._headless, by: made.ws._actBy });
  const after = ledger(W);
  ok(W.inputs() === inputs0 && W.cli.get(r.sessionId).inputs.length === 0, `① the fake CLI received ZERO input frames (${W.cli.get(r.sessionId).inputs.length})`);
  ok(rows(after) === rows(before), `① the spend ledger has NO new row (${rows(before)} → ${rows(after)})`, { before, after });
  ok(r.link === 'vibespace://conversation/claude:c-1' && r.desktop === null && /nothing was sent to it/.test(r.note) && /background tasks it had started ended with its process/.test(r.note) && !/timer|cron/.test(r.note) && r.target === 'c-1', '① the answer: the link, desktop null (no row on this hub), the note (what ended with the process, nothing sent — no promise about CLI timers)', r);
  // CONTROL: one billed create in the same world — the probe sees it
  const o = await W.verbs['conversations.open']({ cwd: '/w/proj', backend: 'claude', mode: 'chat', name: 'a worker' }, W.ctx());
  const ctl = ledger(W);
  ok(!!o.ok && rows(ctl) === rows(after) + 2 && ctl.instance === after.instance + 1 && ctl.reasons[ctl.reasons.length - 1] === 'automation-open', `① CONTROL: one conversations.open in the same world adds ONE automation-open row (instance ${after.instance} → ${ctl.instance}, the key's ${after.identities} → ${ctl.identities})`, { o, ctl });
  W.guard.flush();
  await tick(50);
  let disk = null; try { disk = JSON.parse(fs.readFileSync(path.join(W.dataDir, 'spend-budget.json'), 'utf8')); } catch { disk = null; }
  ok(!!disk && !!disk.budget && disk.budget.instance.length === 1 && disk.budget.instance[0].reason === 'automation-open', '① …and on disk the ledger holds exactly that one row — none from the resume', disk && disk.budget);
}
{
  // RED CONTROL: the road with a first message (a mutant copy of the PURE resume message; the ORCH copy reads it) ⇒ the probe sees it
  const M = mutantCopies('conv-resume', REPO);
  const pure = fs.readFileSync(path.join(REPO, 'src/inbox-reopen.js'), 'utf8'), orch = fs.readFileSync(path.join(REPO, 'src/server/inbox-reopen.js'), 'utf8');
  const patched = anchored(pure, 'resume: true, resumeId: conv.id,', "resume: true, resumeId: conv.id, initialPrompt: 'continue',", 'first-message');
  ok(patched !== pure, '① (the first-message patch applied)');
  const pureCopy = M.write('src/inbox-reopen.js', patched, 'first-message');
  const orchCopy = anchored(orch, "require('../inbox-reopen.js')", `require(${JSON.stringify(pureCopy)})`, 'the inbox-reopen ORCH reads the patched copy');
  ok(orchCopy !== orch, '① (the ORCH copy rewired to the patched message)');
  const W = world({ ir: require(M.write('src/server/inbox-reopen.js', orchCopy, 'first-message')), facts: { 'claude:c-2': CHAT } });
  W.endedOne('claude:c-2');
  const r = await W.resume('claude:c-2');
  ok(!!r.ok && W.inputs() === 1, `① RED CONTROL: a road whose create carries a first message — the fake CLI received ${W.inputs()} input frame (the leg's zero would be red)`, r);
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2, label: '① ' })) ok(!!c.pass, c.name, c.detail);
}

console.log('— ② REFUSED BY NAME, nothing created');
{
  const W = world({ facts: { 'claude:t-1': { ...CHAT, mode: 'terminal' }, 'claude:t-2': CHAT, 'shell:sh-1': { ...CHAT }, 'claude:a-1': CHAT } , archived: ['claude:a-1'] });
  await W.ops.openConversation({ type: 'create', backend: 'claude', mode: 'chat', cwd: '/w/proj', resume: true, resumeId: 'live-1', cols: 120, rows: 30 }, { kind: 'human', actBy: 'human:me' }, { ws: IR.headlessCreator('human:me'), attachedSessions: new Set() });
  const c0 = W.creates.length;
  const live = await W.resume('claude:live-1');
  ok(!live.ok && live.code === 'not_ended' && /message it instead \(its link is in this answer\)/.test(live.why) && !!live.sessionId && live.link === 'vibespace://conversation/claude:live-1', '② a conversation that is running ⇒ not_ended (its id and link named)', live);
  const nf = await W.resume('claude:nobody');
  ok(!nf.ok && nf.code === 'not_found', '② a conversation neither live nor ended here ⇒ not_found', nf);
  W.endedOne('claude:a-1');
  const ar = await W.resume('claude:a-1');
  ok(!ar.ok && ar.code === 'archived' && /un-archiving it is the person/.test(ar.why), '② archived ⇒ archived (un-archiving is the person\'s)', ar);
  W.endedOne('shell:sh-1');
  const sh = await W.resume('shell:sh-1');
  ok(!sh.ok && sh.code === 'needs_a_page' && /no chat road/.test(sh.why), '② a harness with no chat road (the shell) ⇒ needs_a_page', sh);
  W.endedOne('claude:t-1');
  const tm = await W.resume('claude:t-1');
  ok(!tm.ok && tm.code === 'needs_a_page' && /terminal window/.test(tm.why), '② a conversation that ran in a TERMINAL window ⇒ needs_a_page (the headless road starts chat only)', tm);
  ok(W.creates.length === c0, `② …none of them created anything (${W.creates.length - c0})`);
  W.endedOne('claude:t-2');
  const tc = await W.resume('claude:t-2');
  ok(!!tc.ok && W.creates.length === c0 + 1, '② RED CONTROL: the same record in a CHAT window resumes (one create) — the refusal is the window\'s doing', tc);
  const R = world({ facts: { 'claude:r-1': CHAT }, reachable: ['someone-else'] });
  R.endedOne('claude:r-1');
  const rr = await R.resume('claude:r-1');
  ok(!rr.ok && rr.code === 'not_granted' && R.creates.length === 0, '② out of the key\'s reach ⇒ not_granted, nothing created', rr);
}

console.log('— ③ THE KEPT RECORD: a resume nobody pressed starts no turn nobody pressed');
{
  const facts = { 'claude:g-1': { ...CHAT, goal: 'active' }, 'claude:m-1': { ...CHAT, timerMark: true }, 'codex:u-1': { ...CHAT, goal: 'unknown' }, 'claude:u-2': { ...CHAT, goal: 'unknown' }, 'codex:n-1': CHAT };
  const W = world({ facts });
  for (const k of Object.keys(facts)) W.endedOne(k);
  const g = await W.resume('claude:g-1'), m = await W.resume('claude:m-1'), u = await W.resume('codex:u-1');
  ok(!g.ok && g.code === 'goal_active' && /continue its goal — a billed turn/.test(g.why), '③ an ACTIVE goal in the kept record ⇒ goal_active', g);
  ok(!m.ok && m.code === 'timer_marked' && /CLI timer/.test(m.why), '③ a CLI timer mark ⇒ timer_marked (its own code)', m);
  ok(!u.ok && u.code === 'goal_unknown' && /continues an active goal by itself/.test(u.why), '③ codex (its resume continues a goal by itself) with a goal the record cannot speak for ⇒ goal_unknown', u);
  ok(W.creates.length === 0, `③ …none of the three created anything (${W.creates.length})`);
  const u2 = await W.resume('claude:u-2'), n1 = await W.resume('codex:n-1');
  ok(!!u2.ok && !!n1.ok && W.creates.length === 2, '③ Claude (read to start nothing on a resume) with an unknown goal, and codex with NO goal: both resumed', { u2, n1 });
  // RED CONTROL: codex's row read as 'nothing' — the same unknown-goal record resumes: the refusal is the row's doing
  const R = world({ facts, rowOf: (b) => (b === 'codex' ? { resumeContinues: 'nothing', headless: true } : harnessRowOf(capsOf(b))) });
  R.endedOne('codex:u-1');
  const ru = await R.resume('codex:u-1');
  ok(!!ru.ok && R.creates.length === 1, '③ RED CONTROL: codex\'s row read as \'nothing\' — the same record RESUMES (one create)', ru);
  const rowsNow = Object.fromEntries(['claude', 'codex', 'opencode', 'antigravity', 'shell', 'no-such-harness'].map((b) => [b, harnessRowOf(capsOf(b))]));
  ok(rowsNow.claude.resumeContinues === 'nothing' && rowsNow.codex.resumeContinues === 'goal' && rowsNow.opencode.resumeContinues === 'nothing' && rowsNow.antigravity.resumeContinues === 'nothing'
    && !!rowsNow.claude.headless && !!rowsNow.codex.headless && !!rowsNow.opencode.headless && !!rowsNow.antigravity.headless && rowsNow.shell.headless === false
    && rowsNow['no-such-harness'].resumeContinues === 'unread' && rowsNow['no-such-harness'].headless === false
    && rowsNow.claude.midSession === true && rowsNow.codex.midSession === true && rowsNow.antigravity.midSession === true && rowsNow.opencode.midSession === false && rowsNow.shell.midSession === false && rowsNow['no-such-harness'].midSession === false,
  '③ the declared rows (src/backend-caps.js): claude/opencode/antigravity \'nothing\', codex \'goal\'; the shell and an undeclared harness have no headless road; a message mid-session reaches claude/codex/antigravity, never opencode or the shell (piece 7 reads it: 主开发 2026-11-20 04:07Z)', rowsNow);
  const V = require(path.join(REPO, 'src/resume-line.js')).resumeVerdict;
  ok(['unread', undefined, 'maybe'].every((rc) => V({ goal: 'none', mode: 'chat' }, { resumeContinues: rc, headless: true }).code === 'harness_unread') && V({ goal: 'unknown', mode: 'chat' }, { resumeContinues: 'unread', headless: true }).code === 'harness_unread',
    '③ a row that declares NEITHER value is refused whatever the goal says — harness_unread, even with a stated none (the cure round\'s must 1)');
}

console.log('— ④ THE LINE IN THE VERB');
{
  const W = world({ facts: { 'claude:q-0': CHAT, 'claude:q-1': CHAT, 'claude:q-2': CHAT }, hold: true });
  for (const k of ['claude:q-0', 'claude:q-1', 'claude:q-2']) W.endedOne(k);
  const p0 = W.resume('claude:q-0'), p1 = W.resume('claude:q-1');
  const third = await W.resume('claude:q-2');
  await tick(2);
  ok(!!third.ok && third.queued === true && third.position === 1 && W.creates.length === 2 && third.link === 'vibespace://conversation/claude:q-2', `④ two start, the third is answered at once: queued, place ${third.position} — ${W.creates.length} creates in flight`, third);
  W.gates.shift()();
  await tick(5);
  ok(W.creates.length === 3, `④ one start ENDED ⇒ the third starts (${W.creates.length} creates)`);
  await W.release();
  const [a0, a1] = await Promise.all([p0, p1]);
  await tick(5);
  ok(!!a0.ok && !!a1.ok && [...W.activeSessions.values()].filter((s) => /^q-/.test(s.backendSessionId)).length === 3, '④ …and all three are live');
}
{
  const keys = Array.from({ length: 14 }, (_, k) => 'claude:f-' + k);
  const W = world({ facts: Object.fromEntries(keys.map((k) => [k, CHAT])), hold: true });
  for (const k of keys) W.endedOne(k);
  const answers = [];
  for (const k of keys.slice(0, 12)) answers.push(await Promise.race([W.resume(k), tick(5).then(() => 'started')]));
  const eleventh = await W.resume(keys[12]);
  const other = await W.resume(keys[13], 'ak2');
  ok(answers.filter((a) => a === 'started').length === 2 && answers.filter((a) => a && a.queued).length === 10 && !eleventh.ok && eleventh.code === 'line_full' && eleventh.count === 10 && /^10 of this key's resumes wait their turn — ask again once one of them has started \(conversations status names it live\)$/.test(eleventh.why),
    `④ one key: two running, ten waiting — its eleventh waiting resume ⇒ ${eleventh.code} with the count ${eleventh.count}`, eleventh);
  ok(!!other.ok && !!other.queued && other.position === 11, `④ …another key is not refused (its place ${other.position})`, other);
  await W.release();
}
{
  const W = world({ facts: { 'claude:j-1': CHAT }, hold: true });
  W.endedOne('claude:j-1');
  const a = W.resume('claude:j-1', 'ak1'), b = W.resume('claude:j-1', 'ak2');
  await tick(2);
  await W.release();
  const [ra, rb] = await Promise.all([a, b]);
  ok(!!ra.ok && !!rb.ok && ra.sessionId === rb.sessionId && W.creates.length === 1, `④ the same conversation asked by two keys at once ⇒ ONE create, both answered with ${ra.sessionId}`, { ra, rb });
}
{
  // the stand-in answers resume-already-live naming the person's session (its backendSessionId the conversation's, as ws-create finds it)
  const P = world({ facts: { 'claude:k-3': CHAT }, answer: 'already', hold: true });
  P.endedOne('claude:k-3');
  const pending = P.resume('claude:k-3');
  await tick(2);
  P.activeSessions.set('sess-person', { backend: 'claude', backendSessionId: 'k-3', clients: new Map() });   // the person's press won the race
  await P.release();
  const pr = await pending;
  ok(!!pr.ok && pr.already === true && pr.sessionId === 'sess-person' && P.creates.length === 1, '④ a person\'s Resume racing the verb ⇒ ONE session: the verb answers `already` with the person\'s', pr);
}
{
  const W = world({ facts: { 'claude:e-1': CHAT }, answer: 'error' });
  W.endedOne('claude:e-1');
  const r = await W.resume('claude:e-1');
  ok(!r.ok && r.code === 'resume_failed' && r.why === 'Account error: the account cannot serve — a person can resume it from its window', '④ a create that answers an error ⇒ resume_failed with the create\'s own reason by name, and the door', r);
}
{
  let adopted;
  const gate = new Promise((r) => { adopted = r; });
  const W = world({ facts: { 'claude:b-1': CHAT }, ready: gate });
  W.endedOne('claude:b-1');
  const r = await W.resume('claude:b-1');
  await tick(5);
  ok(!!r.ok && r.queued === true && r.position === 1 && W.creates.length === 0, '④ before the boot ADOPTED the live sessions the line starts nothing (queued, place 1, no create)', r);
  adopted();
  await tick(10);
  ok(W.creates.length === 1 && [...W.activeSessions.values()].some((s) => s.backendSessionId === 'b-1'), '④ …the boot adopted them ⇒ the waiting resume starts');
  const C = world({ facts: { 'claude:b-2': CHAT } });
  C.endedOne('claude:b-2');
  const rc = await C.resume('claude:b-2');
  ok(!!rc.ok && !rc.queued && C.creates.length === 1, '④ CONTROL: with no boot gate the same resume starts at once');
}

{
  // the answer names the desktop of the row that shows it (the hub's layouts, read only)
  const W = world({ facts: { 'claude:d-1': CHAT }, layouts: { desktopMeta: [{ id: 'desk-2', name: 'Desk 2' }], desktops: { 'desk-2': { autoSave: { windows: [{ winId: 'e-1', type: 'chat', backend: 'claude', backendSessionId: 'd-1' }] } } } } });
  W.endedOne('claude:d-1');
  const r = await W.resume('claude:d-1');
  ok(!!r.ok && !!r.desktop && r.desktop.id === 'desk-2' && r.desktop.name === 'Desk 2', '④ the answer names the desktop of the conversation\'s row ({id, name}); with no row it is null (①)', r.desktop);
}

console.log('— ⑤ THE KEPT-RECORD FACTS');
{
  const kf = RL.keptFacts, nameOf = RL.sidecarNameOf;
  const meta = { backend: 'claude', cwd: '/w/p', mode: 'chat', webuiSessionId: 'sess-7-1' };
  const k = (o = {}) => ({ sockFile: 'cw-7-1', meta: { ...meta, ...o } });
  ok(kf(null).goal === 'unknown' && kf(null).kept === false && kf(null).mode === null && nameOf(null) === null, '⑤ no kept record ⇒ goal unknown, mode unknown (never «none»), no sidecar to read');
  ok(nameOf(k()) === 'sess-7-1' && kf(k(), { goal: 'ship it', goalStatus: 'active' }).goal === 'active', '⑤ the wrapper\'s active goal ⇒ active (its sidecar named by the meta\'s webui id)');
  ok(['complete', 'paused', 'cleared'].every((st) => kf(k(), { goal: null, goalStatus: st }).goal === 'none') && kf(k(), { goal: null, goalStatus: null }).goal === 'none', '⑤ a goal STATED complete / paused / cleared, or stated absent (the keys held, null) ⇒ none');
  ok(kf(k(), { mode: 'chat' }).goal === 'unknown' && kf(k(), { mode: 'chat', streaming: false }).goal === 'unknown', '⑤ «NO GOAL STATED» IS NOT «NO GOAL»: a sidecar that never names a goal (its goal read failed, the wrapper died first) ⇒ unknown (must 1)');
  ok(kf(k(), { queue: [{}, {}], queueReadAt: 1793499999000 }).queue === 2 && kf(k(), { queue: [], queueReadAt: 1793499999000 }).queue === 0 && kf(k(), { queue: [] }).queue === null && kf(k(), {}).queue === null,
    '⑤ the thread queue a sidecar states only with the wrapper\'s READ mark (queueReadAt): its length; an empty list never read, or none ⇒ null (主开发 14:51Z)');
  ok(kf(k(), { goal: 'x', goalStatus: 'usageLimited' }).goal === 'unknown' && kf(k(), null).goal === 'unknown', '⑤ a status it cannot judge, or no sidecar ⇒ unknown');
  ok(kf(k(), { goal: 'x' }).goal === 'active', '⑤ a goal with no status (an older wrapper) ⇒ active');
  ok(kf(k({ cliTimerMark: true }), {}).timerMark === true && kf(k(), {}).timerMark === null, '⑤ the CLI timer mark is the record\'s one-way mark');
  const legacy = { sockFile: 'cw-9-2.orphan', meta: { cwd: '/w' } };
  ok(nameOf(legacy) === 'sess-9-2' && kf(legacy, { mode: 'chat' }).mode === 'chat' && kf({ sockFile: 'cw-9', meta: { cwd: '/w' } }, {}).mode === 'terminal', '⑤ no webui id in the meta ⇒ sess-<n> of cw-<n>; the mode the wrapper\'s chat, else the meta\'s (default terminal)');
  ok(nameOf(k({ webuiSessionId: '../../etc/x' })) === null && nameOf(k({ webuiSessionId: 'a/b' })) === null, '⑤ a webui id that is not a plain file name names no sidecar (never read)');
}

console.log('— ⑦ THE RECORD OF THE LAST END, READ (a real boot-restore; the record in the contract\'s shape — piece 3 writes it)');
{
  const BRm = require(path.join(REPO, 'src/server/boot-restore.js'));
  const quietly = async (fn) => { const l = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return await fn(); } finally { console.log = l; console.warn = w; } };
  let nE = 0;
  const readerWorld = () => {
    const d = path.join(DIR, 'rd' + (++nE)), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers'), SOCK = path.join(d, 'sockets');
    for (const x of [META, BUF, SOCK]) fs.mkdirSync(x, { recursive: true });
    const activeSessions = new Map(), creates = [];
    const br = BRm.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
      activeSessions, sessionCounterRef: { value: 0 }, attachToDtach: () => { }, setupSessionPty: () => { },
      readSessionMeta: () => ({}), writeSessionMeta: () => { }, deleteSessionMeta: () => { },
      broadcastToSession: () => { }, broadcastActiveSessions: () => { }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { }, getHosts: () => null, getDialBridge: () => null, getExitProxy: () => null, note: () => { } });
    const road = { kept: br.keptRecordOf };
    const readJson = async (f) => JSON.parse(await fs.promises.readFile(f, 'utf8'));
    let n = 0;
    // THE RECORD'S CONTRACT (主开发 14:51Z): an end's record — reason «ended», endedBy, the time, endFacts {goalStated, goalStatus,
    // queueRead, queueCount}, the mode, the folder, the machine — kept where a restart keeps its own (<sock>.json.stopped)
    const ended = (backend, cid, endFacts, { mode = 'chat' } = {}) => {
      const sock = `cw-${++n}-1793500000000`;
      fs.writeFileSync(path.join(META, sock + '.json.stopped'), JSON.stringify({ backend, backendSessionId: cid, mode, cwd: '/w/proj', host: null, name: 'conv ' + n, webuiSessionId: `sess-${n}-1793500000000`,
        status: 'stopped', stoppedAt: 1793500000000 + n, stopReason: 'ended', endedBy: { kind: 'person', id: null, name: null }, endFacts }));
    };
    // a restart's record: its wrapper's sidecar beside it (the boot's own road)
    const restarted = (backend, cid, sidecar) => {
      const sock = `cw-${++n}-1793500000000`, id = `sess-${n}-1793500000000`;
      fs.writeFileSync(path.join(META, sock + '.json.stopped'), JSON.stringify({ backend, backendSessionId: cid, mode: 'chat', cwd: '/w/proj', webuiSessionId: id, status: 'stopped', stoppedAt: 1793500000000 + n, stopReason: 'dead-socket-at-boot' }));
      fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify(sidecar));
    };
    const handleCreate = async (ws, data) => { creates.push(data); const id = 'sess-live-' + creates.length; activeSessions.set(id, { backend: data.backend || 'claude', backendSessionId: data.resumeId, clients: new Map([[ws, {}]]) }); ws.send(JSON.stringify({ type: 'created', sessionId: id, reqId: data.reqId })); };
    const ops = OPS.forDeps({ handleCreate, activeSessions, specTables: () => TABLES, getSessionKey: (x) => (x.backendSessionId ? `${x.backend || 'claude'}:${x.backendSessionId}` : ''), WS_OPEN: 1 });
    const reopen = IR.create({ getOpenConversation: () => ops.openConversation, activeSessions, discover: async (key) => ({ cwd: '/w/proj', sessionKey: key }), defaultsFor: () => ({ permission: 'default', extraArgs: '' }), log: () => { } });
    const line = RL.createResumeLine({ start: RL.startThrough({ reopen: (i, o) => reopen.reopen(i, o) }), log: () => { } });
    const verbs = OPS.automationVerbs({ activeSessions, ops, waitMs: 0, resumeLine: line, resumeFactsOf: RL.factsReaderOver({ buffersDir: BUF, road, readJson }),
      resumeRowOf: (b) => harnessRowOf(capsOf(b)), deadOf: (t) => { const k = String(t), i = k.indexOf(':'); return { conversationId: k.slice(i + 1), sessionKey: k, name: null, groups: [] }; } });
    const ctx = { caller: { conversationId: 'mgr-1', sessionKey: 'claude:mgr-1', groups: [] }, keyId: 'ak1', reach: () => ({ ok: true }) };
    return { creates, ended, restarted, resume: (key) => verbs['conversations.resume']({ target: key }, ctx), kept: (key) => br.keptRecordOf(key) };
  };
  const E = readerWorld();
  const NONE_READ = { goalStated: true, goalStatus: null, queueRead: true, queueCount: 0 };
  E.ended('codex', 'thr-a', NONE_READ);
  E.ended('codex', 'thr-b', { ...NONE_READ, goalStatus: 'active' });
  E.ended('claude', 'c0de0000-0000-4000-8000-00000000000c', { goalStated: false, goalStatus: null, queueRead: false, queueCount: null }, { mode: 'terminal' });
  E.ended('codex', 'thr-q', { ...NONE_READ, queueCount: 2 });
  E.ended('codex', 'thr-u', { ...NONE_READ, queueRead: false, queueCount: 0 });   // the wrapper's empty list before any read: no fact
  E.ended('codex', 'thr-g', { goalStated: false, goalStatus: null, queueRead: true, queueCount: 0 });
  E.ended('claude', 'c0de0000-0000-4000-8000-0000000000c1', { goalStated: false, goalStatus: null, queueRead: false, queueCount: null });
  const ka = await E.kept('codex:thr-a');
  ok(!!ka && ka.meta.stopReason === 'ended' && ka.meta.endFacts.queueRead === true, '⑦ an end\'s record in the contract\'s shape is read back through boot-restore\'s own reader (keptRecordOf)', ka && ka.meta);
  const ra = await E.resume('codex:thr-a');
  ok(!!ra.ok && E.creates.length === 1 && E.creates[0].resumeId === 'thr-a', '⑦ codex whose end STATED no goal and a queue READ empty: resumed', ra);
  const rb = await E.resume('codex:thr-b');
  ok(!rb.ok && rb.code === 'goal_active', '⑦ codex whose end stated an ACTIVE goal: refused goal_active', rb);
  const rc = await E.resume('claude:c0de0000-0000-4000-8000-00000000000c');
  ok(!rc.ok && rc.code === 'needs_a_page' && /terminal window/.test(rc.why), '⑦ a conversation that ended in a TERMINAL window: refused needs_a_page', rc);
  const rq = await E.resume('codex:thr-q');
  ok(!rq.ok && rq.code === 'queue_kept' && /^2 messages still wait in its thread's queue/.test(rq.why), '⑦ a queue READ with two in it: refused queue_kept (2)', rq);
  const ru = await E.resume('codex:thr-u');
  ok(!ru.ok && ru.code === 'queue_unknown' && /does not say its thread's queue was read/.test(ru.why), '⑦ codex whose record does NOT say its queue was read (the wrapper\'s empty list before any read): refused queue_unknown — the same record with queueRead true resumed (thr-a)', ru);
  const rg = await E.resume('codex:thr-g');
  ok(!rg.ok && rg.code === 'goal_unknown', '⑦ codex whose end did not state its goal: refused goal_unknown', rg);
  const rcl = await E.resume('claude:c0de0000-0000-4000-8000-0000000000c1');
  ok(!!rcl.ok, '⑦ claude (read to start nothing on a resume) with neither its goal nor its queue stated: resumed — an unread queue refuses only a row that runs one by itself', rcl);
  // THE ONE SHARED LEG (主开发 15:19Z — the same bytes in piece 3's suite): a sidecar holding a goal and NO status, through piece 3's
  // REAL writer (boot-restore endFactsBefore + keepEnded) ⇒ the record's goalStatus says active ⇒ the verdict refuses on codex
  {
    const d = path.join(DIR, 'shared'), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers'), SOCK = path.join(d, 'sockets');
    for (const x of [META, BUF, SOCK]) fs.mkdirSync(x, { recursive: true });
    const activeSessions = new Map();
    const br = BRm.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '', activeSessions, sessionCounterRef: { value: 0 }, attachToDtach: () => { }, setupSessionPty: () => { },
      readSessionMeta: () => ({}), writeSessionMeta: () => { }, deleteSessionMeta: () => { }, broadcastToSession: () => { }, broadcastActiveSessions: () => { }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { }, getHosts: () => null, getDialBridge: () => null, getExitProxy: () => null, note: () => { } });
    const SHARED_BYTES = JSON.stringify({ mode: 'chat', goal: 'ship the lane' });   // a goal held, no status
    fs.writeFileSync(path.join(BUF, 'sess-7-1793600000000.json'), SHARED_BYTES);
    const session = { backend: 'codex', backendSessionId: 'thr-shared', mode: 'chat', cwd: '/w/proj', host: null };
    const facts = await br.endFactsBefore(session, 'sess-7-1793600000000');
    await quietly(() => br.keepEnded('cw-7-1793600000000', { backend: 'codex', backendSessionId: 'thr-shared', mode: 'chat', cwd: '/w/proj', webuiSessionId: 'sess-7-1793600000000' }, { kind: 'person', actorId: null, name: null }, facts));
    const rec = await br.keptRecordOf('codex:thr-shared');
    const F = RL.keptFacts(rec, null);
    const v = require(path.join(REPO, 'src/resume-line.js')).resumeVerdict({ ...F, archived: false }, harnessRowOf(capsOf('codex')));
    ok(facts.goalStated === true && !!rec && rec.meta.endFacts.goalStatus === 'active' && F.goal === 'active' && !v.ok && v.code === 'goal_active',
      '⑦ THE SHARED LEG: a sidecar holding a goal and no status ⇒ piece 3\'s writer keeps goalStatus active ⇒ this reader reads ACTIVE ⇒ refused goal_active on codex', { facts, endFacts: rec && rec.meta.endFacts, F: F.goal, v });
  }
  // a RESTART's record: the wrapper's sidecar states its queue only with the read's mark (queueReadAt)
  const R = readerWorld();
  R.restarted('codex', 'thr-r1', { mode: 'chat', goal: null, goalStatus: null, queue: [] });
  R.restarted('codex', 'thr-r2', { mode: 'chat', goal: null, goalStatus: null, queue: [], queueReadAt: 1793499999000 });
  const r1 = await R.resume('codex:thr-r1'), r2 = await R.resume('codex:thr-r2');
  ok(!r1.ok && r1.code === 'queue_unknown' && !!r2.ok, '⑦ a restart\'s record: a sidecar whose empty queue was never READ ⇒ queue_unknown; with the wrapper\'s read mark (queueReadAt) ⇒ resumed', { r1, r2 });
}

console.log('— ⑧ THE NEW-HARNESS CHECKLIST ASKS FOR THE ROW');
{
  const HF = await import(path.join(REPO, 'scripts/harness-fences.mjs'));
  const kind = HF.ROW_KINDS.find((k) => k.kind === 'resume-continues');
  const caps = fs.readFileSync(path.join(REPO, 'src/backend-caps.js'), 'utf8');
  const ctx = (text) => ({ read: (rel) => (rel === 'src/backend-caps.js' ? text : null), builtin: ['claude', 'codex'] });
  const stripped = caps.replace("    resumeContinues: 'goal',\n", '');
  ok(!!kind && kind.check({ id: 'codex', label: 'Codex' }, ctx(caps)).length === 0 && kind.check({ id: 'claude', label: 'Claude' }, ctx(caps)).length === 0, '⑧ the row kind «resume-continues»: the declared rows answer nothing to add');
  ok(stripped !== caps && kind.check({ id: 'codex', label: 'Codex' }, ctx(stripped)).length === 1 && /resumeContinues: 'nothing' \| 'goal'/.test(kind.check({ id: 'codex', label: 'Codex' }, ctx(stripped))[0].row), '⑧ RED CONTROL: the codex row without its declaration ⇒ the checklist names the row to add');
}

console.log('— ⑥ THE WIRING');
{
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/const startResume = RL\.startThrough\(\{ get reopen\(\) \{ return typeof resumeRoad\.reopen === 'function' \? reopenRoads : null; \} \}\);/.test(wiring) && /const reopenRoads = \(item, o\) => \(item && item\.hostId && !remoteSettled \? /.test(wiring) && /RL\.createResumeLine\(\{ start: \(e\) => \(e\.payload && typeof e\.payload\.run === 'function' \? e\.payload\.run\(e\) : startResume\(e\)\), ready: new Promise\(\(r\) => \{ adoptedNow = r; \}\)/.test(wiring), 'the hub\'s line: started through the road (a delivery\'s owed wake by its own start — the manager design\'s piece 7), gated on the boot\'s adoption — its reopen through the two roads\' one gate (a REMOTE resume waits for the re-adoption of the machines\' left-running conversations: test-hosts-held-census §10 drives it)');
  ok(/const resumeRowOf = \(backend\) => RL_PURE\.harnessRowOf\(require\('\.\.\/backend-caps\.js'\)\.capsOf\(backend\)\);/.test(wiring) && /^    resumeRowOf,$/m.test(wiring) && /resumeLine, resumeFactsOf,/.test(wiring) && /const resumeFactsOf = RL\.factsReaderOver\(\{ buffersDir: BUFFERS_DIR, road: resumeRoad, readJson: readDataJson \}\);/.test(wiring), 'the verb reads the declared rows, the kept-record facts (the module\'s own reader) and the one line');
  const opsSrc = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf8'), brSrc = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  const orch = fs.readFileSync(path.join(REPO, 'src/server/resume-line.js'), 'utf8');
  const resumeBody = opsSrc.slice(opsSrc.indexOf("'conversations.resume': async"), opsSrc.indexOf("'groups.invite': async"));
  const p4Wiring = wiring.slice(wiring.indexOf("// THE MANAGER DESIGN'S PIECE 4 — the hub's ONE LINE"), wiring.indexOf("const automation = require('./automation-engine.js').create("));
  ok(!/keepEnded|consumeKept|endKeeper|writeFile|rename\(/.test(orch + resumeBody + p4Wiring) && /async function keepEnded\(/.test(brSrc) && /async function keptRecordOf\(key\)/.test(brSrc),
    'ONE WRITER (主开发 14:51Z): piece 4\'s own code writes no end record and consumes none — boot-restore carries piece 3\'s writer (keepEnded) and piece 4\'s READER (keptRecordOf)');
  // MUST 5: the line opens when the keepers' 8 s re-adoption has SETTLED — resolved or thrown alike — never right after the restore
  // the B-f276 stores chain meets it (lane bl-jobs, the move onto the .413 tip): a HELD hosts.json — the re-adoption waits for the list's
  // read, and the line opens at once (nothing waits on a list that may stay held; a remote resume meets the same hold, refused by name)
  const iReadopt = srv.indexOf("setTimeout(() => { const go = () => Promise.resolve().then(() => readoptOrphanKeeperSessions()).catch((e) => console.warn('[readopt] failed:', e.message)).finally(() => { _arRestoreSettled = true; if (resumeRoad) resumeRoad.adoptedRemote(); }); const keep = () => hosts.whenRead(go, 'the re-adoption of remote sessions left running', 'boot:readopt', { onLetGo: () => { console.warn('[readopt] the re-adoption keeps its place in the waits for hosts.json (it runs at the read; remote resumes are refused until it settles)'); keep(); } }); const held = !!(hosts.held && hosts.held() && hosts.whenRead); (held ? (keep(), Promise.resolve()) : go()).finally(() => { if (resumeRoad) resumeRoad.adopted(); }); }, 8000);");
  ok(iReadopt > 0 && (srv.match(/resumeRoad\.adopted\(\)/g) || []).length === 1, 'server.js: the line opens once the keepers\' sessions are adopted too — in the re-adoption\'s finally (a throw opens it as well), nowhere else (must 5); a held machines list opens the LOCAL road at once — a REMOTE resume waits for the re-adoption to settle on every road (the wiring\'s one gate: adoptedRemote(), reached once, in the re-adoption\'s own finally; test-hosts-held-census §10 drives it)');
  ok(/^const inboxReopen = require\('\.\/src\/server\/inbox-reopen\.js'\)\.create\([^\n]*\}\); if \(resumeRoad\) Object\.assign\(resumeRoad, \{ reopen: \(item, o\) => inboxReopen\.reopen\(item, o\), kept: keptRecordOf \}\);/m.test(srv) && (srv.match(/Object\.assign\(resumeRoad,/g) || []).length === 1 && /probeSockets, probeFacts, stoppedSessions, keepEnded, endFactsBefore, keptRecordOf, consumeKeptOf, \/\/ stoppedSessions/.test(srv),
    'server.js: the road is inbox-reopen\'s reopen, bound once right where inbox-reopen is made; the kept record\'s reader is boot-restore\'s OWN instance (its map lives inside create)');
  ok(/rowDesktopOf: \(key\) => \{ let lay = null; try \{ lay = persistenceRouter && typeof persistenceRouter\.readLayouts === 'function' \? persistenceRouter\.readLayouts\(\) : null; \} catch \(e\) \{ if \(!\(e && e\.code === 'store_unread'\)\) throw e; \}[^\n]*? const d = RL_PURE\.rowDesktopOf\(lay, key\); return d \? \{ id: d\.id, name: d\.name == null \? null : require\('\.\.\/peer-text\.js'\)\.toAgentText\(d\.name, \{ kind: 'line', max: 200 \}\) \} : null; \}/.test(wiring)
    && /router\.readLayouts = \(\) => readLayouts\(\);/.test(fs.readFileSync(path.join(REPO, 'src/routes/persistence.js'), 'utf8')), 'the answer\'s desktop reads the hub\'s layouts (the persistence router\'s reader, read only; the desktops held ⇒ no desktop named — B-225b)');
  const K = require(path.join(REPO, 'src/automation-keys.js'));
  const row = (K.SCOPES || []).find((x) => x && (x.verb === 'conversations.resume' || x.id === 'conversations.resume')) || (K.SCOPES && K.SCOPES['conversations.resume']);
  ok(!!row && row.billed === false, 'the scope row: conversations.resume, not billed', row);
  const ops = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf8');
  const body = ops.slice(ops.indexOf("'conversations.resume': async"), ops.indexOf("'groups.invite': async"));
  const ir = fs.readFileSync(path.join(REPO, 'src/server/inbox-reopen.js'), 'utf8');
  const CODES = ['not_ended', 'archived', 'needs_a_page', 'goal_active', 'timer_marked', 'goal_unknown', 'line_full', 'resume_failed'];
  const route = fs.readFileSync(path.join(REPO, 'src/routes/automation.js'), 'utf8');
  ok(CODES.every((c) => Number.isInteger(K.CODES[c]) && new RegExp(`\\b${c}: '`).test(route)) && K.CODES.line_full === 429 && K.CODES.resume_failed === 503 && K.CODES.goal_active === 409,
    'every refusal of the verb has its status at the door (409 · line_full 429 · resume_failed 503) and its words', CODES.map((c) => [c, K.CODES[c]]));
  const CLI = require(path.join(REPO, 'data/bin/vibespace-api'));
  const t1 = CLI.typed(['conversations', 'resume', 'claude:c-1']), t2 = CLI.typed(['conversations', 'resume']);
  ok(t1.verb === 'conversations.resume' && t1.args.target === 'claude:c-1' && /takes <target>/.test(t2.error || '') && /vibespace-api conversations resume <target> .*nothing is sent, nothing billed/.test(CLI.USAGE)
    && ['not_ended', 'archived', 'needs_a_page', 'goal_active', 'timer_marked', 'goal_unknown', 'line_full'].every((c) => CLI.USAGE.includes(c)), 'the CLI: `vibespace-api conversations resume <target>`, its usage naming every refusal', { t1, t2 });
  ok(body.length > 200 && !/spendGuard|authorize\(|noteSpend/.test(body) && /await open\(spec\.data, \{ kind: 'human'/.test(ir), 'no spend in the verb\'s road: the handler asks no guard, the reopen opens as a person\'s create (no spend reason added)');
}

console.log(`\n${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
