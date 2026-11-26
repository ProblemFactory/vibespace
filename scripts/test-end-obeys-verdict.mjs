#!/usr/bin/env node
// scripts/test-end-obeys-verdict.mjs — AN AGENT'S END OBEYS THE VERDICT; TERMINATE SAYS WHO (lane end-obeys-verdict, majordomo
// piece 3; the owner decided: force only for a conversation the calling key itself opened). In-process:
//   ① conversations.end through automationVerbs over the REAL list builder (src/server/conversation-facts.js) and stub ops: a
//      session with each busy reason and with an unknown fact is refused with its code — the session still live, nothing ended.
//      RED CONTROL: a copy whose verdict is switched off lets the mid-turn end through.
//   ② force: on a conversation THIS key opened (reach by 'opener') it ends a busy one; reached through a grant ⇒ force_not_yours.
//   ③ a person's Terminate (the ws road, kind human) ends the busy session — the verdict is the agent's door only.
//   ④ the kept record, on the REAL boot-restore over scratch dirs: after an admitted end the stopped row carries reason ended,
//      who (kind agent, the asking conversation by id and name / kind person) and when; a session-list read DURING the kill
//      does not eat it (CONTROL: registering it BEFORE the kill — stoppedSessions consumes a copy whose conversation is live);
//      a resume consumes it.
//   ⑤ the words (src/lib/stopped-why.js): «Terminated by «name» at …» / «Terminated by hand at …»; the census of stopReason
//      readers (a fifth unlisted reader is RED).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CF = require(path.join(REPO, 'src/conversation-facts.js'));
const COL = require(path.join(REPO, 'src/server/conversation-facts.js'));
const OPS = require(path.join(REPO, 'src/server/conversation-ops.js'));
const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
const ROOT = scratch('end-obeys-verdict');
fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

const { ok, counts } = checker();   // B-119d: THE ONE checker (scripts/lib/check.mjs) — a condition is a boolean, a name a string, else it throws

const CID = 'e2e00000-0000-4000-8000-0000000000a1', CALLER = 'e2e00000-0000-4000-8000-0000000000ee';
const KEEPS = { sidecarFacts: { background: true, timers: true, lastRecordAt: true } };
const idleFacts = () => { const st = CF.factsFresh(); CF.factsStep(st, { type: 'system', subtype: 'init', claude_code_version: CF.LEVEL_MEASURED_TO }, 1); return st; };   // the span's own top — read, never typed (a floor that moves never strands it)
/** the sources of an idle conversation; `over` replaces one of them */
const srcs = (over = {}) => ({ capsOf: () => KEEPS, keyOf: (s) => (s.backendSessionId ? `claude:${s.backendSessionId}` : null), turnOf: (s) => s._turn || 'idle', turnKnown: (s) => s.mode === 'chat',
  heldOf: () => 0, asksOf: () => [], goalOf: () => 'none', continueOf: () => ({ armed: false }), jobsOf: () => ({ running: 0, schedules: 0, nextFireAt: null, items: [] }),
  handoverOf: () => false, browserOf: () => null, desktopOf: () => ({ desktop: null, window: false }), ...over });
const session = (extra = {}) => ({ backend: 'claude', mode: 'chat', backendSessionId: CID, name: 'Worker', sockName: 'cw-1-1794880000000', cwd: '/tmp', _convFacts: idleFacts(), ...extra });
function world({ s = session(), over = {}, ops = null } = {}) {
  const sessions = new Map([['sess-1', s], ['sess-me', { backend: 'claude', mode: 'chat', backendSessionId: CALLER, name: 'Manager', _convFacts: idleFacts() }]]);
  const ended = [];
  const stubOps = { endConversation: async (target, by) => { ended.push({ target, by }); sessions.delete(target.webuiId); return { ok: true, sessionId: target.webuiId }; } };
  const listFacts = COL.create({ activeSessions: sessions, ...srcs(over) });
  const verbs = (ops || OPS).automationVerbs({ activeSessions: sessions, listFacts, ops: stubOps });
  const call = (args, by = 'grant') => verbs['conversations.end'](args, { caller: { conversationId: CALLER, sessionKey: `claude:${CALLER}`, name: 'Manager' }, keyId: 'k1',
    reach: ({ conversationId }) => (conversationId === CALLER ? { ok: true, by: 'self' } : { ok: true, by }) });
  return { sessions, ended, call };
}

console.log('① the end obeys the verdict');
{
  const cases = [
    ['a running turn', { s: session({ _turn: 'running' }) }, 'turn'],
    ['a background task', { s: session({ _convFacts: (() => { const st = idleFacts(); CF.factsStep(st, { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'b1', task_type: 'local_bash', description: 'a server' }] }, 2); return st; })() }) }, 'background'],
    ['a held prompt', { over: { heldOf: () => 1 } }, 'held'],
    ['an open ask', { over: { asksOf: () => [{ id: 'q1' }] } }, 'asks'],
    ['a goal loop', { over: { goalOf: () => 'active' } }, 'goal'],
    ['an armed continue', { over: { continueOf: () => ({ armed: true, resetsAt: 9 }) } }, 'continue'],
    ['a CLI timer it set', { s: session({ _convFacts: (() => { const st = idleFacts(); CF.factsStep(st, { type: 'command_lifecycle', state: 'started', wakeup_source: 'loop_wakeup', scheduled_for: 5 }, 3); return st; })() }) }, 'timer'],
    ['a hand-over in flight', { over: { handoverOf: () => true } }, 'handover'],
    ['a schedule without the person\'s wake grant', { over: { jobsOf: () => ({ running: 0, schedules: 1, nextFireAt: 9, items: [{ id: 'j1', kind: 'schedule', wakeGrant: false }] }) } }, 'job'],
    ['an UNKNOWN wake grant', { over: { jobsOf: () => ({ running: 1, schedules: 0, nextFireAt: null, items: [{ id: 'j1', kind: 'job', wakeGrant: null }] }) } }, 'job_unknown'],
  ];
  for (const [label, w, code] of cases) {
    const W = world(w);
    const r = await W.call({ target: CID });
    ok(!r.ok && r.code === 'subject_busy' && r.busy.some((b) => b.code === code) && W.ended.length === 0 && W.sessions.has('sess-1') && /Nothing was stopped/.test(r.why) && /its card in the sidebar \(Terminate in its menu\)/.test(r.why) && !/pass force/.test(r.why),
      `${label} ⇒ subject_busy (${code}), the session still live, nothing ended, the person's door named (the one that exists) — a granted key is never told of force`, { code: r.code, busy: r.busy && r.busy.map((b) => b.code) });
  }
  // on top of piece 2: only a chat conversation whose harness row keeps every sidecar fact can ever be judged idle by the hub —
  // a terminal one, or a harness that keeps none, is «only a person can end it» (so a manager does not retry)
  const realCaps = (b) => require(path.join(REPO, 'src/backend-caps.js')).capsOf(b);   // the gate reads the caps the rows are built from — here the real rows
  for (const [label, s0] of [['a terminal conversation', session({ mode: 'terminal' })], ['a chat on a harness whose row keeps no sidecar facts (codex)', session({ backend: 'codex' })]]) {
    const W = world({ s: s0, over: { capsOf: realCaps } });
    const r = await W.call({ target: CID });
    ok(!r.ok && r.code === 'person_only' && /only a person can end it/.test(r.why) && W.ended.length === 0 && W.sessions.has('sess-1'), `${label} ⇒ person_only («only a person can end it»), nothing ended`, r);
  }
  const forcedTerm = world({ s: session({ mode: 'terminal' }) });
  const ft = await forcedTerm.call({ target: CID, force: true }, 'opener');
  // the legs the readers missed: the browser reason; each unknown; a harness whose row keeps SOME facts — the gate reads the SAME caps
  // the rows are built from (listFacts.capsOf)
  const browsed = world({ over: { browserOf: () => ({ drivenBy: 'person', viewers: 0, personBrowsing: false }) } });
  const rb = await browsed.call({ target: CID });
  const unknowns = [['heldPrompts', { heldOf: () => undefined }], ['asks', { asksOf: () => undefined }], ['goal', { goalOf: () => undefined }], ['continue', { continueOf: () => undefined }], ['handover', { handoverOf: () => undefined }], ['jobs', { jobsOf: () => undefined }]];
  const uk = [];
  for (const [fact, over] of unknowns) { const W = world({ over }); const r0 = await W.call({ target: CID }); uk.push([fact, r0.code, (r0.busy || []).map((b) => b.code).join()]); }
  const partial = world({ over: { capsOf: () => ({ sidecarFacts: { background: true, timers: false, lastRecordAt: true } }) } });
  const rp = await partial.call({ target: CID });
  ok(!rb.ok && rb.busy.some((b) => b.code === 'browser') && uk.every(([, c, b]) => c === 'subject_busy' && /_unknown/.test(b)) && rp.code === 'person_only' && /its harness/.test(rp.why),
    'the browser reason refuses; EACH unknown refuses with its _unknown code; a harness row that keeps only SOME sidecar facts (read from the same caps the rows use) is person_only', { browser: rb.code, uk, partial: rp.code });
  ok(!!ft.ok && forcedTerm.ended.length === 1, 'force on a terminal conversation THIS key opened ends it (the coordinator\'s own terminal worker — the changelog says so)', ft);
  const idle = world();
  const r = await idle.call({ target: CID });
  ok(!!r.ok && idle.ended.length === 1 && r.link === `vibespace://conversation/claude:${CID}`, 'an idle conversation with every fact known is ended — the answer carries its link', r);
  // RED CONTROL: the verdict switched off
  const MUT = mutantCopies('end-obeys-verdict', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf8');
  const NEEDLE = '    if (!v.endable) { const ref = CF.refusalOf(v, { propose }); return { ...ref, why: ref.why + teach, noticeName: label }; }';   // + { propose }: lane login-request-card (a refusal teaches the propose door only to a key that holds it)
  ok(src.split(NEEDLE).length === 2, 'the verdict\'s refusal is in the end verb once (the mutation anchor)');
  const M = MUT.load('src/server/conversation-ops.js', anchored(src, NEEDLE, '    void v;', 'verdict-cleared'), 'verdict-cleared');
  const red = world({ s: session({ _turn: 'running' }), ops: M });
  const rr = await red.call({ target: CID });
  ok(!!rr.ok && red.ended.length === 1, 'RED CONTROL the verdict switched off: the mid-turn end goes THROUGH — the legs above would be red', rr);
}

console.log('②b ONE GATE for the sibling verb, the recipe taught, the door that exists (主开发 15:0xZ musts 1–3)');
{
  // MUST 1 — conversations.archive asks the SAME gate before anything is resolved
  const archW = (s0, by) => {
    const sessions = new Map([['sess-1', s0], ['sess-me', { backend: 'claude', mode: 'chat', backendSessionId: CALLER, name: 'Manager', _convFacts: idleFacts() }]]);
    const ended = [], archived = [];
    const stubOps = { endConversation: async (target) => { ended.push(target); sessions.delete(target.webuiId); return { ok: true }; } };
    const listFacts = COL.create({ activeSessions: sessions, ...srcs() });
    const verbs = OPS.automationVerbs({ activeSessions: sessions, listFacts, ops: stubOps, archive: (k) => { archived.push(k); return { ok: true }; }, asksOf: () => [], resolveAsks: () => ({ changed: [] }), turnOf: (x) => x._turn || 'idle' });
    const call = (args) => verbs['conversations.archive'](args, { caller: { conversationId: CALLER, sessionKey: `claude:${CALLER}` }, keyId: 'k1', reach: () => ({ ok: true, by }) });
    return { sessions, ended, archived, call };
  };
  const bg = () => session({ _convFacts: (() => { const st = idleFacts(); CF.factsStep(st, { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'b1', task_type: 'local_bash', description: 'a server' }] }, 2); return st; })() });
  const A1 = archW(bg(), 'grant');
  const a1 = await A1.call({ target: CID });
  const A2 = archW(session({ _turn: 'running' }), 'grant');
  const a2 = await A2.call({ target: CID, force: true });
  ok(!a1.ok && a1.code === 'subject_busy' && a1.busy.some((b) => b.code === 'background') && A1.sessions.has('sess-1') && !A1.archived.length && !a2.ok && a2.code === 'force_not_yours' && A2.sessions.has('sess-1') && !A2.ended.length,
    'MUST 1 the archive verb asks the ONE gate: a granted conversation with background work is refused and lives; force through a grant is refused by the force code', { a1: a1.code, a2: a2.code });
  // 主开发 15:31Z must 1 — the archive's OWN recipe: --resolve-asks discounts the asks it resolves; without it, asks open
  const archAsk = (by) => {
    const sessions = new Map([['sess-1', session()], ['sess-me', { backend: 'claude', mode: 'chat', backendSessionId: CALLER, name: 'Manager', _convFacts: idleFacts() }]]);
    const ended = [], archived = [], resolved = [];
    const asksNow = new Map([[`claude:${CID}`, [{ id: 'q1', by: 'agent' }]]]);
    const stubOps = { endConversation: async (target) => { ended.push(target); sessions.delete(target.webuiId); return { ok: true }; } };
    const listFacts = COL.create({ activeSessions: sessions, ...srcs({ asksOf: (k) => asksNow.get(k) || [] }) });
    const verbs = OPS.automationVerbs({ activeSessions: sessions, listFacts, ops: stubOps, archive: (k) => { archived.push(k); return { ok: true }; }, asksOf: (k) => asksNow.get(k) || [], resolveAsks: (ids) => { resolved.push(...ids); asksNow.clear(); return { changed: ids }; }, turnOf: () => 'idle' });
    return { call: (args) => verbs['conversations.archive'](args, { caller: { conversationId: CALLER, sessionKey: `claude:${CALLER}` }, keyId: 'k1', reach: () => ({ ok: true, by }) }), ended, archived, resolved };
  };
  const AR = archAsk('grant'); const ar0 = await AR.call({ target: CID }); const ar1 = await AR.call({ target: CID, resolveAsks: true });
  ok(ar0.code === 'asks_open' && !!ar1.ok && ar1.archived === true && AR.resolved.join() === 'q1' && AR.ended.length === 1,
    'the archive\'s own recipe: an idle granted conversation with one open ask — without --resolve-asks «asks open»; WITH it the gate discounts those asks: archived, the ask resolved', { ar0: ar0.code, ar1 });
  // «forced» only when the gate WOULD have refused: an idle own worker ended with the force word is no «ended mid-task»
  const idleOwn = world(); await idleOwn.call({ target: CID, force: true }, 'opener');
  const busyOwn = world({ s: session({ _turn: 'running' }) }); await busyOwn.call({ target: CID, force: true }, 'opener');
  const grantedTerm = await world({ s: session({ mode: 'terminal' }) }).call({ target: CID }, 'grant');
  ok(idleOwn.ended[0].by.forced === undefined && busyOwn.ended[0].by.forced === true && grantedTerm.code === 'person_only' && !/force/.test(grantedTerm.why),
    '«forced» is recorded only when the gate would have refused (an idle own worker ended with --force is not «mid-task»); a granted key\'s «only a person» refusal never names force', { idle: idleOwn.ended[0].by, busy: busyOwn.ended[0].by });
  // MUST 2 — the refusals of the key's OWN conversation teach the force word; any other reach is never told; a conversation is its own
  const ow = world({ s: session({ _turn: 'running' }) });
  const o1 = await ow.call({ target: CID }, 'opener');
  const ot = world({ s: session({ mode: 'terminal' }) });
  const o2 = await ot.call({ target: CID }, 'opener');
  const gr = await world({ s: session({ _turn: 'running' }) }).call({ target: CID }, 'grant');
  ok(o1.code === 'subject_busy' && /This key opened it: pass force \(--force\) to end it anyway\./.test(o1.why) && o2.code === 'person_only' && /This key opened it: pass force/.test(o2.why) && !/force/.test(gr.why),
    'MUST 2 the key that OPENED it is taught the recipe on both refusals (busy, person-only); a granted key never hears of force', { o1: o1.why, o2: o2.why });
  const selfW = world({ s: session({ _turn: 'running', backendSessionId: CALLER }) });
  const s1 = await selfW.call({ target: CALLER });
  const s2 = await selfW.call({ target: CALLER, force: true });
  ok(s1.code === 'subject_busy' && /It is this conversation itself: pass force \(--force\)/.test(s1.why) && !!s2.ok && selfW.ended.length === 1,
    'MUST 2 a conversation ending ITSELF: its own turn runs, so it is refused — and taught; with force it ends (a conversation is its own: self counts as its opener)', { s1: s1.why, s2 });
  const inst = await world({ s: session({ _turn: 'running' }) }).call({ target: CID, force: true }, 'instance');
  const grp = await world({ s: session({ _turn: 'running' }) }).call({ target: CID, force: true }, 'groups');
  ok(/through the instance grant/.test(inst.why) && /through a Task Group grant/.test(grp.why) && inst.code === 'force_not_yours', 'the force refusal is worded by HOW the key reaches it (instance / Task Group / grant), not always «through a grant»', { inst: inst.why, grp: grp.why });
  // MUST 3 — the door that exists today: the conversation's card in the sidebar, Terminate in its menu
  const card = fs.readFileSync(path.join(REPO, 'src/lib/session-card.js'), 'utf8'), cfsrc = fs.readFileSync(path.join(REPO, 'src/conversation-facts.js'), 'utf8'), opsrc = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf8');
  ok(/id: 'session\.terminate', title: \(\) => tr\('Terminate'\)/.test(card) && cfsrc.includes('A person can terminate it from its card in the sidebar (Terminate in its menu).') && !/Conversations and browsers/.test(cfsrc + opsrc),
    'MUST 3 every refusal names the door that EXISTS (the sidebar card\'s Terminate — pinned in session-card), never the unbuilt System screen');
}

console.log('② force — only for a conversation this key opened');
{
  const opened = world({ s: session({ _turn: 'running' }) });
  const a = await opened.call({ target: CID, force: true }, 'opener');
  ok(!!a.ok && opened.ended.length === 1, 'force on a conversation THIS key opened ends it, busy as it is (the coordinator\'s own worker)', a);
  const granted = world({ s: session({ _turn: 'running' }) });
  const b = await granted.call({ target: CID, force: true }, 'grant');
  ok(!b.ok && b.code === 'force_not_yours' && granted.ended.length === 0 && /nothing was stopped/.test(b.why), 'force on a conversation reached through a GRANT ⇒ force_not_yours, nothing ended', b);
  const AK = require(path.join(REPO, 'src/automation-keys.js'));
  const row = AK.scopeOf('conversations.end');
  ok(!!(row.args({ target: CID, force: true }).ok) && row.args({ target: CID, force: true }).args.force === true && !row.args({ target: CID, bogus: 1 }).ok, 'the closed table: conversations.end takes target and an optional force');
}

// ③ + ④ the REAL boot-restore's kept record over scratch dirs, and the real ops' end road around a stub kill body
const META = path.join(ROOT, 'meta'), BUF = path.join(ROOT, 'buf'), SOCK = path.join(ROOT, 'sock');
for (const d of [META, BUF, SOCK]) fs.mkdirSync(d, { recursive: true });
const active = new Map();
const api = BR.create({ rootDir: ROOT, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
  activeSessions: active, sessionCounterRef: { value: 0 }, attachToDtach: () => { }, setupSessionPty: () => { }, readSessionMeta: () => ({}), writeSessionMeta: () => { }, deleteSessionMeta: () => { },
  broadcastToSession: () => { }, broadcastActiveSessions: () => { }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { }, getHosts: () => null, getDialBridge: () => null, getExitProxy: () => null, note: () => { } });
let duringKill = null;
/** the kill body as the ws handler's: it answers `killed` and THEN leaves the live map (the same order) */
const endSession = async (data, { reply = () => { } } = {}) => {
  if (duringKill) await duringKill();
  let sid = data.sessionId;
  if (!active.has(sid) && data.backendSessionId) for (const [k, s0] of active) if (s0.backendSessionId === data.backendSessionId) { sid = k; break; }   // the kill body's stale-id fallback
  const ok1 = active.has(sid);
  try { reply({ type: 'killed', sessionId: sid, ok: ok1 }); } catch { }
  active.delete(sid);
};
const KEYS = { k1: 'Lane dispatch' };
const ops = (keepEnded = api.keepEnded, more = {}) => OPS.forDeps({ endSession, activeSessions: active, keepEnded, endFactsBefore: api.endFactsBefore, keyNameOf: (id) => KEYS[id] || null, ...more });
const rowOf = async (cid) => (await api.stoppedSessions()).find((r) => r.backendSessionId === cid) || null;

console.log('③ a person\'s Terminate ends a busy conversation');
{
  active.set('sess-p', session({ _turn: 'running', backendSessionId: 'e2e00000-0000-4000-8000-0000000000b2', sockName: 'cw-2-1794880000002', name: 'Busy one' }));
  const t0 = Date.now();
  await ops().endConversation({ sessionId: 'sess-p' }, { kind: 'human', actBy: 'person@sign-in' });
  const row = await rowOf('e2e00000-0000-4000-8000-0000000000b2');
  ok(!active.has('sess-p') && !!row && row.stopReason === 'ended' && !!row.endedBy && row.endedBy.kind === 'person' && row.endedBy.actorId === null && row.endedBy.name === null && row.stoppedAt >= t0,
    'the person\'s Terminate ends it (the verdict is the agent\'s door only) — its row: ended, by a person, when', row);
}

console.log('④ the kept record: who and when; the race; a resume');
{
  active.set('sess-a', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000c3', sockName: 'cw-3-1794880000003', name: 'Finished worker' }));
  const t0 = Date.now();
  // a session-list read DURING the kill (the page's list asked while the kill body runs)
  let readDuring = null;
  duringKill = async () => { readDuring = await api.stoppedSessions(); };
  const r = await ops().endConversation({ webuiId: 'sess-a' }, { kind: 'automation', key: 'k1', cid: CALLER, sessionKey: `claude:${CALLER}`, name: 'Manager' });
  duringKill = null;
  const row = await rowOf('e2e00000-0000-4000-8000-0000000000c3');
  ok(!!r.ok && !!row && row.stopReason === 'ended' && row.endedBy.kind === 'agent' && row.endedBy.actorId === 'k1' && row.endedBy.name === 'Lane dispatch' && row.stoppedAt >= t0 && row.name === 'Finished worker',
    'after an admitted end the stopped row carries reason ended, WHO (an agent: its KEY\'s id and name — the contract) and when — and the name it had', row);
  ok(Array.isArray(readDuring) && fs.existsSync(path.join(META, 'cw-3-1794880000003.json.stopped')), 'a session-list read DURING the kill did not eat the kept record (it was written after the session left the live map)', { readDuring: readDuring && readDuring.length });
  // CONTROL: registering the copy BEFORE the kill — the read during the kill consumes it (its conversation is still live)
  active.set('sess-x', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000d4', sockName: 'cw-4-1794880000004', name: 'Early' }));
  await api.keepEnded('cw-4-1794880000004', { backend: 'claude', backendSessionId: 'e2e00000-0000-4000-8000-0000000000d4', name: 'Early', cwd: '/tmp', mode: 'chat' }, { kind: 'agent', actorId: 'x', name: 'Manager' });
  duringKill = async () => { await api.stoppedSessions(); };
  await endSession({ sessionId: 'sess-x' });
  duringKill = null;
  for (let i = 0; i < 50 && fs.existsSync(path.join(META, 'cw-4-1794880000004.json.stopped')); i++) await new Promise((r) => setTimeout(r, 10));   // the consume's unlink is async: let it land
  ok(!(await rowOf('e2e00000-0000-4000-8000-0000000000d4')) && !fs.existsSync(path.join(META, 'cw-4-1794880000004.json.stopped')), 'CONTROL a record registered BEFORE the kill is CONSUMED by the read during it (its conversation was still live) — the order above is the cure');
  // a resume consumes it
  active.set('sess-r', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000c3', sockName: 'cw-5-1794880000005' }));
  ok(!(await rowOf('e2e00000-0000-4000-8000-0000000000c3')), 'a resume (the conversation live again) consumes its ended record');
  active.delete('sess-r');
}

console.log('⑥ THE ONE END RECORD\'s contract (主开发 14:51Z): the one bounded read, the end facts, the rank, the consume, the mark, the age');
{
  const never = () => new Promise(() => { });
  // ONE bounded read before the kill — a read that never settles: the Terminate waits the bound, no longer; the facts say «not stated»
  active.set('sess-n', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000e5', sockName: 'cw-6-1794880000006', name: 'Sick mount', cwd: '/srv/w', host: null, mode: 'chat' }));
  // the end RETURNS at all only because the read is bounded (it never settles) — no wall-clock assert (the ratchet is at 0)
  await ops(api.keepEnded, { endFactsBefore: (s, id) => api.endFactsBefore(s, id, { boundMs: 80, read: never }) }).endConversation({ sessionId: 'sess-n' }, { kind: 'human', actBy: 'person@sign-in' });
  const rn = JSON.parse(fs.readFileSync(path.join(META, 'cw-6-1794880000006.json.stopped'), 'utf8'));   // the record itself (the page's row carries who and when)
  const src = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  ok(!active.has('sess-n') && !!rn && !!rn.endedBy && rn.endedBy.actorId === null && !!rn.endFacts && rn.endFacts.goalStated === false && rn.endFacts.queueRead === false && /not read within 80 ms/.test(rn.endFacts.notStated) && rn.endFacts.folder === '/srv/w' && rn.endFacts.mode === 'chat' && src.includes('const END_READ_MS = 1000;'),
    'a read that NEVER settles: the Terminate returns at the bound (a second by default), the record is written from memory and its facts say «not stated»', { facts: rn && rn.endFacts });
  // the facts read from a real sidecar: the goal keys HELD, the claude wrapper's own queue
  fs.writeFileSync(path.join(BUF, 'sess-g.json'), JSON.stringify({ mode: 'chat', goal: 'Ship the release', queue: [{ id: 1 }, { id: 2 }], queueReadAt: 1794880000000 }));
  active.set('sess-g', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000e6', sockName: 'cw-7-1794880000007', name: 'Goal', cwd: '/srv/g', host: 'box-2' }));
  await ops().endConversation({ sessionId: 'sess-g' }, { kind: 'human', actBy: 'person@sign-in' });
  const g = JSON.parse(fs.readFileSync(path.join(META, 'cw-7-1794880000007.json.stopped'), 'utf8'));
  const f = g.endFacts || {};
  ok(!!g.endedBy && g.endedBy.kind === 'person' && g.endedBy.actorId === null && f.goalStated === true && f.goalStatus === 'active' && !('goal' in f) && f.queueRead === true && f.queueCount === 2 && f.mode === 'chat' && f.folder === '/srv/g' && f.machine === 'box-2' && !f.notStated,
    'the facts as of the end, read once from its sidecar: goalStated (the goal keys HELD) and its status, queueRead (the wrapper\'s own mark) and the count, the mode, the folder, the machine', f);
  // the codex wrapper's queue: an empty list it began with is NOT a read; its `queueRead` mark is
  fs.writeFileSync(path.join(BUF, 'sess-c1.json'), JSON.stringify({ mode: 'chat', queue: [] }));
  fs.writeFileSync(path.join(BUF, 'sess-c2.json'), JSON.stringify({ mode: 'chat', queue: [], queueReadAt: 1794880000000 }));
  const c1 = await api.endFactsBefore({ backend: 'codex', mode: 'chat' }, 'sess-c1'), c2 = await api.endFactsBefore({ backend: 'codex', mode: 'chat' }, 'sess-c2');
  const cw = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8');
  ok(c1.queueRead === false && c1.queueCount === null && c2.queueRead === true && c2.queueCount === 0 && c1.goalStated === false && c1.goalStatus === null
    && /if \(fresh\) \{ const first = !Number\.isFinite\(meta\.queueReadAt\); meta\.queueReadAt = Date\.now\(\); if \(first\) scheduleMeta\(\); \}\n  if \(!force && fp === queueFingerprint\) return;/.test(cw),
    'the codex wrapper: the empty list it begins with states NO read; its `queueReadAt` mark (piece 4\'s reader\'s name: when a fresh list answered — set before the unchanged-answer return) does', { c1, c2 });
  // a forced end says so on the stopped row; a record write that THROWS never fails the end
  active.set('sess-f', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000e9', sockName: 'cw-11-1794880000011', name: 'Cut' }));
  await ops().endConversation({ webuiId: 'sess-f' }, { kind: 'automation', key: 'k1', forced: true });
  const SW = await import(path.join(REPO, 'src/lib/stopped-why.js'));
  const cut = (await rowOf('e2e00000-0000-4000-8000-0000000000e9')) || {};
  active.set('sess-t', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000ea', sockName: 'cw-12-1794880000012', name: 'Throws' }));
  const rt = await ops(async () => { throw new Error('disk full'); }).endConversation({ webuiId: 'sess-t' }, { kind: 'automation', key: 'k1' });
  ok(!!cut.endedBy && cut.endedBy.forced === true && /^Ended mid-task by «Lane dispatch» at /.test(SW.stoppedWhyText('ended', cut)) && !!rt && rt.ok !== false && !active.has('sess-t'),
    'a FORCED end says so on the stopped row («Ended mid-task by «…»»); a record write that THROWS never fails the end', { by: cut.endedBy, rt });
  // an END OUTRANKS A RESTART: an earlier boot kept an ended record; a later restart's copy of the same conversation is newer
  const M2 = path.join(ROOT, 'meta2'); fs.mkdirSync(M2, { recursive: true });
  const CIDR = 'e2e00000-0000-4000-8000-0000000000e7';
  fs.writeFileSync(path.join(M2, 'cw-8-1794880000008.json.stopped'), JSON.stringify({ backend: 'claude', backendSessionId: CIDR, name: 'Ranked', status: 'stopped', stoppedAt: 1000, stopReason: 'ended', endedBy: { kind: 'person', actorId: null, name: null } }));
  fs.writeFileSync(path.join(M2, 'cw-9-1794880000009.json.stopped'), JSON.stringify({ backend: 'claude', backendSessionId: CIDR, name: 'Ranked', status: 'stopped', stoppedAt: 9000, stopReason: 'dead-socket-at-boot' }));
  const mk = (Mx, meta, live = new Map()) => Mx.create({ rootDir: ROOT, PORT: 0, BUFFERS_DIR: BUF, META_DIR: meta, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
    activeSessions: live, sessionCounterRef: { value: 0 }, attachToDtach: () => { }, setupSessionPty: () => { }, readSessionMeta: () => ({}), writeSessionMeta: () => { }, deleteSessionMeta: () => { },
    broadcastToSession: () => { }, broadcastActiveSessions: () => { }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { }, getHosts: () => null, getDialBridge: () => null, getExitProxy: () => null, note: () => { } });
  const M3 = path.join(ROOT, 'meta3'); fs.cpSync(M2, M3, { recursive: true });   // the RED's world, copied BEFORE the real run (a losing copy's file is deleted)
  const ranked = ((await mk(BR, M2).stoppedSessions()).find((r) => r.backendSessionId === CIDR) || {});
  ok(ranked.stopReason === 'ended', 'AN END OUTRANKS A RESTART: a newer restart\'s copy of the same conversation never turns «ended» back into «a restart ended it»', ranked);
  const RK = "const endRank = (m) => (m && m.stopReason === STOP_ENDED ? 1 : 0);";
  if (src.split(RK).length !== 2) throw new Error('anchor missing: the rank');
  const MUTR = mutantCopies('end-record-rank', REPO).load('src/server/boot-restore.js', anchored(src, RK, 'const endRank = () => 0;', 'no-rank'), 'no-rank');
  const unranked = ((await mk(MUTR, M3).stoppedSessions()).find((r) => r.backendSessionId === CIDR) || {});
  ok(unranked.stopReason === 'dead-socket-at-boot', 'RED: without the rank the newer restart copy wins — the end is forgotten', unranked);
  // THE CREATE ROAD CONSUMES NOTHING (主开发 2026-11-19 03:17Z — the manager stack restacked onto int411 met B-a5a4 (2)): a kept
  // copy and its end record leave only through the consume at a turn that RAN well (consumeKeptOf) or the stopped list's live
  // check — never at registration, never on a turn that failed (B-a5a4's first round lost a failed resume's copy that way)
  const RAN = { type: 'result', subtype: 'success', is_error: false };
  const FAILED = { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['No conversation found with session ID'] };
  const wc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  const LIVE = 'activeSessions.set(id, session);\n', NAMED = 'session._webuiId = id;';
  if (wc.split(LIVE).length !== 2 || wc.indexOf(NAMED, wc.indexOf(LIVE)) < 0) throw new Error('anchor missing: the create road');
  // the create road's code (its comments aside) between where the create makes it live and the id it is given: no consume of a kept copy
  const createRoadConsumes = (text, Mx) => { const a = text.indexOf(LIVE), seg = text.slice(a, text.indexOf(NAMED, a)).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    return /consume|dropKept|keptStopped/.test(seg) || typeof Mx.consumeEnded === 'function'; };
  // A RESUME THAT FAILS: an end on purpose kept its record; the create road makes the conversation live; its turn fails; it leaves
  const resumeThatFails = async (Mx, dir, cid, sock) => {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sock}.json.stopped`), live = new Map(), inst = mk(Mx, dir, live);
    // THIS boot's own record (an earlier boot's file would be asked the transcript question — not this leg's matter)
    await inst.keepEnded(sock, { backend: 'claude', mode: 'chat', backendSessionId: cid, name: 'Resumed', cwd: '/tmp' }, { kind: 'person', actorId: null, name: null });
    const before = !!(await inst.stoppedSessions()).find((r) => r.backendSessionId === cid && r.stopReason === 'ended') && fs.existsSync(file);
    const s = { backend: 'claude', mode: 'chat', claudeSessionId: cid, backendSessionId: cid };
    live.set('sess-r', s);   // the create road: live again
    const planted = typeof Mx.consumeEnded === 'function' ? await Mx.consumeEnded(`claude:${cid}`) : null;   // a create road's consume (only the RED's module has one)
    const atTurn = await inst.consumeKeptOf(s, FAILED);   // its turn FAILED
    live.delete('sess-r');   // the failed resume's process left
    await new Promise((r) => setTimeout(r, 50));   // a consume's unlink is not awaited (the old leg's wait)
    const row = (await inst.stoppedSessions()).find((r) => r.backendSessionId === cid) || null;
    return { before, planted, atTurn, row: row && { stopReason: row.stopReason, endedBy: row.endedBy || null }, file: fs.existsSync(file) };
  };
  const kept = await resumeThatFails(BR, path.join(ROOT, 'meta5'), 'e2e00000-0000-4000-8000-0000000000ee', 'cw-16-1794880000016');
  ok(!createRoadConsumes(wc, BR) && !!kept.before && kept.planted === null && kept.atTurn === null && !!kept.row && kept.row.stopReason === 'ended' && !!kept.row.endedBy && kept.row.endedBy.kind === 'person' && !!kept.file,
    'THE CREATE ROAD CONSUMES NOTHING: a resume that FAILS keeps the copy and its end record — listed again «ended» by a person, its file kept (ws-create holds no consume, boot-restore exports none)', kept);
  // the RED: the create road's consume PUT BACK (the stack's piece 3 as it was: ws-create calls the module's consumeEnded, which
  // drops the kept copy, memory and file) — its plant proven first (it consumed at registration), then the copy and record are lost
  const PUT = "if (data.resume && data.resumeId && !data.fork) { try { require('./server/boot-restore.js').consumeEnded(`${backend}:${data.resumeId}`); } catch { } }\n";
  const RET = '  return { migrateLegacyHomeProjects, restoreSessions, restoreAgentdPipeSessions,', EXP = 'module.exports = { create,';
  if (src.split(RET).length !== 2 || src.split(EXP).length !== 2) throw new Error('anchor missing: the module\'s answer or exports');
  const MUTC = mutantCopies('create-road-consume', REPO).load('src/server/boot-restore.js', anchored(anchored(src, RET, '  liveConsume = async (key) => { await loadKept(); const e = keptStopped.get(String(key || \'\')); if (!e) return false; keptStopped.delete(String(key || \'\')); fs.unlink(keptFile(e.sockFile), () => { }); return true; };\n' + RET, 'consume-at-create'),
    EXP, 'let liveConsume = null;\nfunction consumeEnded(key) { return liveConsume ? liveConsume(key) : Promise.resolve(false); }\n' + EXP + ' consumeEnded,', 'consume-at-create'), 'consume-at-create');
  const lost = await resumeThatFails(MUTC, path.join(ROOT, 'meta6'), 'e2e00000-0000-4000-8000-0000000000ef', 'cw-17-1794880000017');
  ok(!!(createRoadConsumes(wc.replace(LIVE, LIVE + '          ' + PUT), BR)) && !!lost.before && lost.planted === true && !lost.row && !lost.file,
    'RED: the create road\'s consume put back — it consumed at registration (the plant took), and the failed resume LOST the copy and its end record', lost);
  // the ONE consume: a turn that RAN on the live conversation — memory and file; nothing kept ⇒ null
  active.set('sess-k', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000e8', sockName: 'cw-10-1794880000010', name: 'Consumed' }));
  await ops().endConversation({ sessionId: 'sess-k' }, { kind: 'human', actBy: 'person@sign-in' });
  const had = !!(await rowOf('e2e00000-0000-4000-8000-0000000000e8'));
  const gone = await api.consumeKeptOf({ backend: 'claude', mode: 'chat', claudeSessionId: 'e2e00000-0000-4000-8000-0000000000e8', backendSessionId: 'e2e00000-0000-4000-8000-0000000000e8' }, RAN);
  ok(!!had && gone === 'cw-10-1794880000010' && !(await rowOf('e2e00000-0000-4000-8000-0000000000e8')) && !fs.existsSync(path.join(META, 'cw-10-1794880000010.json.stopped'))
    && (await api.consumeKeptOf({ backend: 'claude', claudeSessionId: 'e2e00000-0000-4000-8000-00000000none' }, RAN)) === null,
    'the end record leaves with its copy at a turn that RAN on the live conversation (boot-restore consumeKeptOf): memory and file; nothing kept ⇒ null', { had, gone });
  // 主开发 15:31Z must 2 — a PAIRED MACHINE's end: the row carries its machine (never a local row), the ageing leaves it alone
  active.set('sess-h', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000eb', sockName: 'cw-13-1794880000013', name: 'Remote', cwd: '/home/far', host: 'box-9' }));
  await ops().endConversation({ sessionId: 'sess-h' }, { kind: 'human', actBy: 'person@sign-in' });
  const rh = (await rowOf('e2e00000-0000-4000-8000-0000000000eb')) || {};
  const SR = require(path.join(REPO, 'src/routes/sessions.js'));
  const merged = typeof SR.mergeKeptStopped === 'function' ? SR.mergeKeptStopped([], [rh]) : null;
  ok(rh.host === 'box-9' && rh.cwd === '/home/far' && (!merged || (!!(merged[0]) && merged[0].host === 'box-9')) && src.includes("if (m.stopReason === STOP_ENDED && !m.host) {"),
    'a paired machine\'s Terminate: the stopped row carries its machine (never a local row; a resume goes there) and the ageing never asks this machine for its transcript', { host: rh.host, merged: merged && merged[0] && merged[0].host });
  // a Terminate sent with a STALE page id writes its record (the end's read uses the kill body's own fallback)
  active.set('sess-live', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000ec', sockName: 'cw-14-1794880000014', name: 'Stale page' }));
  await ops().endConversation({ sessionId: 'sess-stale', backendSessionId: 'e2e00000-0000-4000-8000-0000000000ec' }, { kind: 'human', actBy: 'person@sign-in' });
  ok(!active.has('sess-live') && fs.existsSync(path.join(META, 'cw-14-1794880000014.json.stopped')), 'a Terminate sent with a STALE page id: the kill body\'s fallback ends the live session — and its record is written (the read used the same fallback)');
  // the consume waits for the store's FIRST load: a resume in the first seconds after a boot leaves no old file to come back
  const M4 = path.join(ROOT, 'meta4'); fs.mkdirSync(M4, { recursive: true });
  fs.writeFileSync(path.join(M4, 'cw-15-1794880000015.json.stopped'), JSON.stringify({ backend: 'claude', backendSessionId: 'e2e00000-0000-4000-8000-0000000000ed', status: 'stopped', stoppedAt: 1, stopReason: 'ended' }));
  const fresh = mk(BR, M4);
  const c0 = await fresh.consumeKeptOf({ backend: 'claude', claudeSessionId: 'e2e00000-0000-4000-8000-0000000000ed' }, RAN);
  await new Promise((r) => setTimeout(r, 30));
  ok(c0 === 'cw-15-1794880000015' && !fs.existsSync(path.join(M4, 'cw-15-1794880000015.json.stopped')) && src.includes("W.dirty(file, { name: 'kept-copy.write', debounceMs: 0, rank: 0,") && src.includes('landed = (await keepCopy(file, kept, (w) => { why = w; }).durable(file)) === true;'),
    'the consume waits for the store\'s first load (an earlier boot\'s record is consumed, its file gone); the record goes through the store writer, awaited to its landing (B-574d: its temps are the writer\'s own, unique per write)', { c0 });
  const cwp = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8');
  ok(cwp.includes("      if (listed.complete !== true && meta.queueReadAt !== undefined) { delete meta.queueReadAt; scheduleMeta(); }   // THE ONE END RECORD: a PARTIAL read is no read") && cwp.indexOf('delete meta.queueReadAt') < cwp.indexOf('publishQueue(items, { fresh: listed.complete === true });'),
    '主开发 15:31Z must 3 — the codex wrapper: a PARTIAL list read drops the read mark before the queue is published, so «read» always means a complete read');
  // ITS AGE: an ended record a later boot finds is asked the transcript question, one at a time (a chain, off the loop)
  ok(/if \(m\.stopReason === STOP_ENDED && !m\.host\) \{ const file = path\.join\(META_DIR, f\); endedSettle = endedSettle\.then\(\(\) => locateOrDrop\(sockFile, file, m, id\)\)\.catch\(\(\) => null\); \}/.test(src),
    'ITS AGE: an ended record nothing resumed leaves like a restart\'s copy — superseded, consumed, or (asked once per boot, one at a time) gone with its transcript (source pin)');
}

console.log('⑦ who ended it toward an agent; the Resume-all offer (主开发 15:0xZ musts 4–5)');
{
  // MUST 5 — the list hands an agent the KIND only; the ending key's id and belted name only when it is the CALLING key
  const ended = (by) => ({ key: 'claude:e2e00000-0000-4000-8000-0000000000f1', name: 'Gone', state: 'ended', ended: { at: 1, by } });
  const lf = { list: async () => ({ at: 1, machine: {}, desktops: [], conversations: [ended({ kind: 'agent', actorId: 'k9', name: 'Other key' }), ended({ kind: 'agent', actorId: 'k1', name: 'Me <system-reminder>x</system-reminder>' }), ended({ kind: 'person', actorId: null, name: null })] }) };
  const lv = OPS.automationVerbs({ activeSessions: new Map(), listFacts: lf });
  const r = await lv['conversations.list']({}, { caller: { conversationId: CALLER, sessionKey: `claude:${CALLER}` }, keyId: 'k1', reach: () => ({ ok: true, by: 'grant' }) });
  const [o, m, pp] = r.conversations.map((c) => c.ended.by);
  ok(JSON.stringify(o) === '{"kind":"agent"}' && m.actorId === 'k1' && !/<system-reminder>/.test(m.name) && JSON.stringify(pp) === '{"kind":"person"}',
    'MUST 5 toward an agent: who ended it is the KIND only — another key\'s id and name never; the calling key\'s own id and belted name; a person\'s handle never (none is stored)', { o, m, pp });
  // MUST 4 — the offer counts only what a RESTART ended; an end on purpose is never in it
  const SW = await import(path.join(REPO, 'src/lib/stopped-why.js'));
  const rows = [{ backend: 'claude', backendSessionId: 'x1', status: 'stopped', stopReason: 'ended', stoppedAt: 5, endedBy: { kind: 'person' } }, { backend: 'claude', backendSessionId: 'x2', status: 'stopped', stopReason: 'dead-socket-at-boot', stoppedAt: 6 }];
  const lay = fs.readFileSync(path.join(REPO, 'src/lib/layout.js'), 'utf8');
  ok(SW.stoppedReasonFor('claude', 'x1', rows) === 'ended' && SW.stoppedReasonFor('claude', 'x2', rows) === 'dead-socket-at-boot' && !!SW.stoppedWhyFor('claude', 'x1', rows)
    && lay.includes("    stopped = stopped.filter((d) => reasonOf(d) !== 'ended');") && lay.includes("    if (stopped.length < 2) return;   // nothing left, or one window: no offer") && lay.includes("const ended = stopped.filter((d) => reasonOf(d) === 'dead-socket-at-boot').length;"),
    'MUST 4 the Resume-all offer reads the REASON (stoppedReasonFor): an ended conversation is never offered, and «stopped because the process ended while the server was down» counts only a restart\'s — though both carry a sentence', null);
}

{
  // the PAGE's real Terminate road: ws-handler's kill case goes through the same end seam as a person (kind human ⇒ the record says
  // «by a person», no handle stored) — source pins on the road itself
  const wsh = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  ok(wsh.includes("await convOps.endConversation(data, byOfWs(ws), { reply: (m) => ws.send(JSON.stringify(m)) });") && /const byOfWs = \(ws\) => \(\{ kind: 'human',/.test(wsh),
    'the page\'s real Terminate road (ws-handler\'s kill case) goes through the same end seam with kind human — its record says «by a person», no handle stored');
}
console.log('⑤ the words and the census of stopReason readers');
{
  const SW = await import(path.join(REPO, 'src/lib/stopped-why.js'));
  const a = SW.stoppedWhyOf({ status: 'stopped', stopReason: 'ended', stoppedAt: Date.now(), endedBy: { kind: 'agent', name: 'Manager' } });
  const p = SW.stoppedWhyOf({ status: 'stopped', stopReason: 'ended', stoppedAt: Date.now(), endedBy: { kind: 'person', name: null } });
  ok(/^Terminated by «Manager» at .+\.$/.test(a) && /^Terminated by hand at .+\.$/.test(p), 'the window\'s sentence names who ended it: «Terminated by «Manager» at …» / «Terminated by hand at …»', [a, p]);
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(zh.includes('"Terminated by «{name}» at {time}.": "{time} 由「{name}」终止。"') && zh.includes('"Terminated by hand at {time}.": "{time} 手动终止。"') && ja.includes('"Terminated by «{name}» at {time}.": "{time} に「{name}」が終了しました。"') && ja.includes('"Terminated by hand at {time}.": "{time} に手動で終了しました。"')
    && zh.includes('"Ended mid-task by «{name}» at {time}.": "{time} 由「{name}」在任务中途结束。"') && ja.includes('"Ended mid-task by «{name}» at {time}.": "{time} に「{name}」が作業の途中で終了しました。"'), 'all the sentences in three languages — the four dictionary entries asserted, and the forced pair');
  const BAN = /\b(sleep|asleep|hibernat\w*|suspend\w*|paus\w*)\b|睡眠|休眠|挂起|暂停|スリープ|休止/i;
  ok(![a, p, '{time} 由「{name}」终止。', '{time} 手动终止。', '{time} に「{name}」が終了しました。', '{time} に手動で終了しました。'].some((w) => BAN.test(w)), 'the words never say sleep');
  // the census: every src file that reads a SESSION's stopReason is a row; the model's own stop reason is another meaning
  const SESSION_READERS = ['src/server/boot-restore.js', 'src/sessions-assemble.js' /* int411 moved the kept-stopped merge out of src/routes/sessions.js (B-891e) */, 'src/lib/stopped-why.js', 'src/lib/session-card.js', 'src/lib/chat-view.js', 'src/server/conversation-facts.js', 'src/lib/layout.js',
    // the manager design's piece 7: how an ENDED conversation ended, read through piece 4's reader (resume-line keptFacts hands it) by the delivery's gate
    'src/server/resume-line.js', 'src/delivery-wake.js', 'src/server/delivery-wake.js'];
  const OTHER_MEANING = { 'src/opencode-serve.js': 'the model\'s stop reason', 'src/harnesses/antigravity-wall.js': 'the model\'s stop reason', 'src/record-shape.js': 'a record field\'s name',
    'src/message-manager.js': 'the model\'s stop reason', 'src/codex-message-manager.js': 'the model\'s stop reason', 'src/acp-message-manager.js': 'the model\'s stop reason',
    // int411's B-a5a4 (2): how an ACP prompt ENDED (prompt_end's own field), stamped as the session's _promptStopReason for turnRan
    'src/server/stdout/acp-events.js': 'an ACP prompt\'s stop reason (prompt_end)', 'src/session-schema.js': 'the schema note of _promptStopReason (an ACP prompt\'s stop reason)' };
  const walkFrom = (root) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (e.name.endsWith('.js') && /\bstopReason\b|\bstopped(?:Why|Reason)For\b/.test(fs.readFileSync(path.join(root, r), 'utf8'))) out.push(r); } }; walk('src'); return out; };   // + the readers that go THROUGH the stopped-why helper (the layout's tile and the offer's count)
  const files = walkFrom(REPO);
  const unlisted = files.filter((f) => !SESSION_READERS.includes(f) && !OTHER_MEANING[f]);
  const dead = [...SESSION_READERS, ...Object.keys(OTHER_MEANING)].filter((f) => !files.includes(f));
  ok(unlisted.length === 0 && dead.length === 0 && files.length >= 10, `the census of stopReason readers (the literal field AND the stopped-why helper's readers): ${SESSION_READERS.length} read a session's stop reason, ${Object.keys(OTHER_MEANING).length} another meaning — a new reader is RED until classified`, { unlisted, dead });
  const tree = path.join(ROOT, 'census-tree'); fs.mkdirSync(path.join(tree, 'src/lib'), { recursive: true }); fs.writeFileSync(path.join(tree, 'src/lib/planted.js'), 'export const why = (r) => r.stopReason;\n');   // a REAL file in a walked tree
  const planted = walkFrom(tree).filter((f) => !SESSION_READERS.includes(f) && !OTHER_MEANING[f]);
  ok(planted.length === 1, 'CONTROL a planted fifth reader is caught');
}

console.log('⑩ THE STORE HELD UNREAD (the hold\'s law, 主开发 2026-11-19 05:42Z): the end, the list and the resume judge a target\'s Task Groups as UNKNOWN — refused BY NAME, never «in no group»');
{
  const GH = require(path.join(REPO, 'src/server/groups-hold.js')), AK = require(path.join(REPO, 'src/automation-keys.js'));
  // a key whose reach is the whole VibeSpace EXCEPT the Task Group T-G; the target IS in T-G, but the store is held: its groups read []
  const EXC = [{ door: 'automation-key-reach', resource: 'K-1', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'T-G' }] }];
  const reachBy = (A) => (t) => A.reachVerdict({ keyId: 'K-1', caller: CALLER, target: t, reach: 'instance', reachRows: EXC });
  const OPS_SRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf8'), AK_SRC = fs.readFileSync(path.join(REPO, 'src/automation-keys.js'), 'utf8');
  const FACT = ", ...require('./groups-hold.js').fact()";
  const MH = mutantCopies('store-held', REPO);
  const dropped = (anchor, tag) => MH.load('src/server/conversation-ops.js', anchored(OPS_SRC, anchor, anchor.replace(FACT, ''), tag), tag);   // the RED: that site's fact dropped
  const END_AT = "groups: gl, ...require('./groups-hold.js').fact() }, glr === null ? null : lineageOfIds(gl)));   // + the hub's hold";   // lane lg-group-parents (restack 415): the reach takes the target's ancestors beside its groups (targetOf)
  const LIST_AT = "webuiId: r.id || null, groups: Array.isArray(r.groups) ? r.groups : [], ...require('./groups-hold.js').fact() }, r.groupsUnreadable === true ? null : lineageOfIds(";   // lane lg-group-parents (restack 416): a row still being read is unreadable before its ancestors
  const LIVE_AT = "groups: glr || [], ...require('./groups-hold.js').fact() }, glr === null ? null : lineageOfIds(glr)));   // the hold's fact (as the end verb's)";
  const DEAD_AT = "groups: Array.isArray(d.groups) ? d.groups : [], ...require('./groups-hold.js').fact() }, d.inherited";
  const OLD = 'e2e00000-0000-4000-8000-0000000000f1';
  const run = async (O, verb, args, A = AK) => {
    const sessions = new Map([['sess-1', session()], ['sess-me', { backend: 'claude', mode: 'chat', backendSessionId: CALLER, name: 'Manager', _convFacts: idleFacts() }]]);
    const ended = [];
    const stubOps = { endConversation: async (target) => { ended.push(target); sessions.delete(target.webuiId); return { ok: true, sessionId: target.webuiId }; } };
    let submits = 0;   // a COUNTING stand-in for the resume line: an ended record whose facts would resume it is QUEUED here
    const verbs = O.automationVerbs({ activeSessions: sessions, listFacts: COL.create({ activeSessions: sessions, ...srcs() }), ops: stubOps,
      deadOf: (t) => (t === OLD ? { conversationId: OLD, sessionKey: `claude:${OLD}`, name: 'Old', groups: [] } : null),
      resumeFactsOf: () => ({ goal: 'none', timerMark: null, mode: 'chat', queue: 0, cwd: '/tmp' }), resumeRowOf: () => ({ resumeContinues: 'nothing', headless: true }),
      resumeLine: { submit: () => { submits++; return { ok: true, position: 1 }; } } });
    const r = await verbs[verb](args, { caller: { conversationId: CALLER, sessionKey: `claude:${CALLER}`, name: 'Manager' }, keyId: 'K-1', reach: reachBy(A) });
    return { r, ended: ended.length, submits };
  };
  const listed = (x) => !!(x.r && Array.isArray(x.r.conversations) && x.r.conversations.some((c) => c.key === `claude:${CID}`));
  GH.setHeld(() => true);
  let held, red;
  try {
    held = { end: await run(OPS, 'conversations.end', { target: CID }), list: await run(OPS, 'conversations.list', {}), live: await run(OPS, 'conversations.resume', { target: CID }), dead: await run(OPS, 'conversations.resume', { target: OLD }) };
    red = { end: await run(dropped(END_AT, 'end-fact-dropped'), 'conversations.end', { target: CID }), list: await run(dropped(LIST_AT, 'list-fact-dropped'), 'conversations.list', {}),
      live: await run(dropped(LIVE_AT, 'resume-live-fact-dropped'), 'conversations.resume', { target: CID }), dead: await run(dropped(DEAD_AT, 'resume-ended-fact-dropped'), 'conversations.resume', { target: OLD }),
      unnamed: await run(OPS, 'conversations.end', { target: CID }, MH.load('src/automation-keys.js', anchored(AK_SRC, "  if (rv.code === 'groups_unreadable') return {", "  if (false) return {", 'reach-unnamed'), 'reach-unnamed')) };
  } finally { GH.setHeld(() => false); }
  const UNREAD = /Task Groups could not be read just now/;
  ok(held.end.r.code === 'groups_unreadable' && UNREAD.test(held.end.r.why || '') && held.end.ended === 0, 'the END while held: a key reaching «everything except T-G» is refused BY NAME (groups_unreadable, its words) — nothing ended', held.end);
  ok(held.list.r.ok === true && !listed(held.list) && held.list.r.groupsUnreadable === true && /1 conversation\(s\)/.test(held.list.r.beyondWhy || ''), 'the LIST while held: the target is not listed, and the answer SAYS why (groupsUnreadable, beyondWhy) — never a silent «beyond reach»', held.list.r);
  ok(held.live.r.code === 'groups_unreadable' && held.dead.r.code === 'groups_unreadable' && UNREAD.test(held.dead.r.why || '') && held.live.submits === 0 && held.dead.submits === 0, 'the RESUME while held: refused BY NAME for a live target and for an ended one (its record\'s groups read from the same held store) — NOTHING queued (the counting resume line saw no submit)', { live: held.live, dead: held.dead });
  ok(red.end.ended === 1 && red.end.r.code !== 'groups_unreadable', 'RED CONTROL: the end\'s fact dropped — the key «except T-G» ENDS T-G\'s conversation (the harm the law exists for)', red.end);
  ok(!!(listed(red.list)) && !red.list.r.groupsUnreadable, 'RED CONTROL: the list\'s fact dropped — T-G\'s conversation is LISTED to a key that excepts T-G', { listed: listed(red.list) });
  ok(red.live.r.code !== 'groups_unreadable' && red.dead.r.code !== 'groups_unreadable' && red.dead.submits === 1 && red.dead.r.queued === true, 'RED CONTROL: each resume\'s fact dropped — the reach ADMITS the target: the ended one is QUEUED on the resume line for a key that excepts its group (the live one goes on to «not ended»)', { live: red.live.r.code, dead: red.dead });
  ok(red.unnamed.r.code === 'not_granted' && red.unnamed.ended === 0, 'RED CONTROL: the reach judge without its named refusal — refused as «not in the Task Groups this grant reaches» (the wrong words; the law says unknown)', red.unnamed.r.code);
  const rel = await run(OPS, 'conversations.end', { target: CID }), relList = await run(OPS, 'conversations.list', {});
  ok(rel.ended === 1 && !!(listed(relList)) && !relList.r.groupsUnreadable, 'CONTROL — the store READ (no hold): the same key ends and lists the target (its groups read [] are real: in no group)', { ended: rel.ended, listed: listed(relList) });
  // piece 6 (browsers.stop, re-landed for the next block — 主开发 r957/r968): THE STOP while held, the same key «everything except
  // T-G» — a browser held by T-G's conversation is NOT stopped: refused groups_unreadable BY NAME (never «it is not yours»), nothing
  // stopped. RED: the stop's fact dropped — the key STOPS it. CONTROL: the store read, the same key stops it (in no group is real).
  const STOP_AT = "groups: gl, ...require('./groups-hold.js').fact() }, glr === null ? null : lineageOfIds(gl))); } catch { v = null; }   // the stop's reach";
  const stopRun = async (O) => {
    let stopped = 0;
    const row = { id: 'bp-0000e0f1', kind: 'own', name: 'Worker', holders: [{ browserKey: 'vs-bk-eeeeeeeeeeee', sessionId: 'sess-1', turn: 'idle' }], takenOver: false, viewers: 0, personBrowsing: false, inFlight: null, tabsKept: true };
    const verbs = O.automationVerbs({ activeSessions: new Map([['sess-1', session()]]), browsers: { rows: () => [row], stop: async () => { stopped++; return { freed: true }; } } });
    const r = await verbs['browsers.stop']({ id: row.id }, { caller: { conversationId: CALLER, sessionKey: `claude:${CALLER}`, name: 'Manager' }, keyId: 'K-1', reach: reachBy(AK) });
    return { r, stopped };
  };
  ok(OPS_SRC.split(STOP_AT).length === 2, 'control setup: the stop\'s reach call (with the hold\'s fact) is found once');
  GH.setHeld(() => true);
  let stopHeld, stopRed;
  try { stopHeld = await stopRun(OPS); stopRed = await stopRun(dropped(STOP_AT, 'stop-fact-dropped')); } finally { GH.setHeld(() => false); }
  const stopRead = await stopRun(OPS);
  ok(stopHeld.r.code === 'groups_unreadable' && /could not be read/.test(stopHeld.r.why || '') && !/not yours/.test(stopHeld.r.why || '') && stopHeld.stopped === 0, 'the STOP while held: a key reaching «everything except T-G» does not stop the browser of T-G\'s conversation — refused BY NAME (groups_unreadable), nothing stopped', stopHeld.r);
  ok(stopRed.stopped === 1 && stopRed.r.ok === true, 'RED CONTROL: the stop\'s fact dropped — the key «except T-G» STOPS the browser of T-G\'s conversation (the harm the law exists for)', stopRed.r);
  ok(stopRead.stopped === 1 && stopRead.r.ok === true, 'CONTROL — the store READ (no hold): the same key stops it (its groups read [] are real: in no group)', stopRead.r);
}

console.log('⑪ THE NAME LADDER (主开发 2026-11-20 03:06Z): keeping a record of an end never LOWERS a conversation\'s name');
{
  const SA = require(path.join(REPO, 'src/sessions-assemble.js')), SN = require(path.join(REPO, 'src/session-name.js'));
  const SA_SRC = fs.readFileSync(path.join(REPO, 'src/sessions-assemble.js'), 'utf8');
  // a person ENDS an untitled conversation (no CLI title: an older claude, codex, an ACP harness, a turn before any title) whose live
  // name is the creation default, and one whose name was GIVEN — through the REAL writer (keepEnded) and the REAL read-back (stoppedSessions)
  const NOT = 'e2e00000-0000-4000-8000-0000000000c1', GIV = 'e2e00000-0000-4000-8000-0000000000c2', FIRST = 'Draft the launch post for bravo';
  active.set('sess-n1', session({ backendSessionId: NOT, sockName: 'cw-21-1794880000021', name: 'Session 2' }));
  active.set('sess-n2', session({ backendSessionId: GIV, sockName: 'cw-22-1794880000022', name: 'My launch notes', _nameExplicit: true }));
  await ops().endConversation({ sessionId: 'sess-n1' }, { kind: 'human', actBy: 'person@sign-in' });
  await ops().endConversation({ sessionId: 'sess-n2' }, { kind: 'human', actBy: 'person@sign-in' });
  const kept = (await api.stoppedSessions()).filter((r) => r.backendSessionId === NOT || r.backendSessionId === GIV);
  // discovery's own STOPPED rows of the same conversations: named by the first message (discovery-facts nameFromUserRecord)
  const disc = () => [NOT, GIV].map((c) => ({ backend: 'claude', sessionId: c, backendSessionId: c, status: 'stopped', name: FIRST, startedAt: 1 }));
  const rowOfC = (c, rows) => rows.find((r) => r.backendSessionId === c) || {};
  const merged = SA.mergeKeptStopped(disc(), kept);
  ok(kept.length === 2 && SN.sessionDisplayName(rowOfC(NOT, merged)) === FIRST && rowOfC(NOT, merged).stopReason === 'ended',
    'an UNTITLED conversation a person ENDS is named by its FIRST MESSAGE (the sidebar / window / taskbar ladder over the merged row) — never the creation default «Session 2»; the row still says it was ended', { kept: kept.map((k) => ({ name: k.name, nameExplicit: k.nameExplicit })), name: SN.sessionDisplayName(rowOfC(NOT, merged)) });
  ok(SN.sessionDisplayName(rowOfC(GIV, merged)) === 'My launch notes' && rowOfC(GIV, merged).nameExplicit === true,
    'a GIVEN name (at creation / by a rename) survives the end: the record carries the mark and rung ② names the row (over the first message)', rowOfC(GIV, merged));
  // a RESTART's kept copy (a dead socket) takes the same merge — the class is older than the end record
  const dead = [{ backend: 'claude', sessionId: NOT, backendSessionId: NOT, status: 'stopped', stopReason: 'dead-socket-at-boot', name: 'Session 3' }];
  ok(SN.sessionDisplayName(rowOfC(NOT, SA.mergeKeptStopped(disc(), dead))) === FIRST, 'a RESTART\'s kept copy with a default name: the first message stands too', null);
  // RED: the merge as the release had it — the kept name taken whenever it has one
  const AT = 'name: given ? k.name : (r.name || k.name)';
  const MS = mutantCopies('name-ladder', REPO).load('src/sessions-assemble.js', anchored(SA_SRC, AT, 'name: k.name || r.name', 'kept-name-always'), 'kept-name-always');
  const redName = SN.sessionDisplayName(rowOfC(NOT, MS.mergeKeptStopped(disc(), kept)));
  ok(redName === 'Session 2', 'RED CONTROL: the merge taking the kept name whenever it has one — the ended untitled conversation reads «Session 2» (what the hosted run saw)', redName);
}

console.log(`\n${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
