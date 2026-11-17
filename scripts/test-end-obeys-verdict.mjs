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
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CF = require(path.join(REPO, 'src/conversation-facts.js'));
const COL = require(path.join(REPO, 'src/server/conversation-facts.js'));
const OPS = require(path.join(REPO, 'src/server/conversation-ops.js'));
const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
const ROOT = scratch('end-obeys-verdict');
fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };

const CID = 'e2e00000-0000-4000-8000-0000000000a1', CALLER = 'e2e00000-0000-4000-8000-0000000000ee';
const KEEPS = { sidecarFacts: { background: true, timers: true, lastRecordAt: true } };
const idleFacts = () => { const st = CF.factsFresh(); CF.factsStep(st, { type: 'system', subtype: 'init', claude_code_version: '2.1.312' }, 1); return st; };
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
    ok(!r.ok && r.code === 'subject_busy' && r.busy.some((b) => b.code === code) && W.ended.length === 0 && W.sessions.has('sess-1') && /Nothing was stopped/.test(r.why) && /System → Conversations and browsers/.test(r.why),
      `${label} ⇒ subject_busy (${code}), the session still live, nothing ended, the person's door named`, { code: r.code, busy: r.busy && r.busy.map((b) => b.code) });
  }
  // on top of piece 2: only a chat conversation whose harness row keeps every sidecar fact can ever be judged idle by the hub —
  // a terminal one, or a harness that keeps none, is «only a person can end it» (so a manager does not retry)
  for (const [label, s0] of [['a terminal conversation', session({ mode: 'terminal' })], ['a chat on a harness whose row keeps no sidecar facts (codex)', session({ backend: 'codex' })]]) {
    const W = world({ s: s0 });
    const r = await W.call({ target: CID });
    ok(!r.ok && r.code === 'person_only' && /only a person can end it/.test(r.why) && W.ended.length === 0 && W.sessions.has('sess-1'), `${label} ⇒ person_only («only a person can end it»), nothing ended`, r);
  }
  const forcedTerm = world({ s: session({ mode: 'terminal' }) });
  const ft = await forcedTerm.call({ target: CID, force: true }, 'opener');
  ok(ft.ok && forcedTerm.ended.length === 1, 'force on a terminal conversation THIS key opened ends it (the coordinator\'s own terminal worker — the changelog says so)', ft);
  const idle = world();
  const r = await idle.call({ target: CID });
  ok(r.ok && idle.ended.length === 1 && r.link === `vibespace://conversation/claude:${CID}`, 'an idle conversation with every fact known is ended — the answer carries its link', r);
  // RED CONTROL: the verdict switched off
  const MUT = mutantCopies('end-obeys-verdict', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf8');
  const NEEDLE = '        if (!v.endable) return { ...CF.refusalOf(v), target: label };';
  ok(src.split(NEEDLE).length === 2, 'the verdict\'s refusal is in the end verb once (the mutation anchor)');
  const M = MUT.load('src/server/conversation-ops.js', src.replace(NEEDLE, '        void v;'), 'verdict-cleared');
  const red = world({ s: session({ _turn: 'running' }), ops: M });
  const rr = await red.call({ target: CID });
  ok(rr.ok && red.ended.length === 1, 'RED CONTROL the verdict switched off: the mid-turn end goes THROUGH — the legs above would be red', rr);
}

console.log('② force — only for a conversation this key opened');
{
  const opened = world({ s: session({ _turn: 'running' }) });
  const a = await opened.call({ target: CID, force: true }, 'opener');
  ok(a.ok && opened.ended.length === 1, 'force on a conversation THIS key opened ends it, busy as it is (the coordinator\'s own worker)', a);
  const granted = world({ s: session({ _turn: 'running' }) });
  const b = await granted.call({ target: CID, force: true }, 'grant');
  ok(!b.ok && b.code === 'force_not_yours' && granted.ended.length === 0 && /nothing was stopped/.test(b.why), 'force on a conversation reached through a GRANT ⇒ force_not_yours, nothing ended', b);
  const AK = require(path.join(REPO, 'src/automation-keys.js'));
  const row = AK.scopeOf('conversations.end');
  ok(row.args({ target: CID, force: true }).ok && row.args({ target: CID, force: true }).args.force === true && !row.args({ target: CID, bogus: 1 }).ok, 'the closed table: conversations.end takes target and an optional force');
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
  const ok1 = active.has(data.sessionId);
  try { reply({ type: 'killed', sessionId: data.sessionId, ok: ok1 }); } catch { }
  active.delete(data.sessionId);
};
const ops = (keepEnded = api.keepEnded) => OPS.forDeps({ endSession, activeSessions: active, keepEnded });
const rowOf = async (cid) => (await api.stoppedSessions()).find((r) => r.backendSessionId === cid) || null;

console.log('③ a person\'s Terminate ends a busy conversation');
{
  active.set('sess-p', session({ _turn: 'running', backendSessionId: 'e2e00000-0000-4000-8000-0000000000b2', sockName: 'cw-2-1794880000002', name: 'Busy one' }));
  const t0 = Date.now();
  await ops().endConversation({ sessionId: 'sess-p' }, { kind: 'human', actBy: 'person@sign-in' });
  const row = await rowOf('e2e00000-0000-4000-8000-0000000000b2');
  ok(!active.has('sess-p') && row && row.stopReason === 'ended' && row.endedBy && row.endedBy.kind === 'person' && row.endedBy.name === null && row.stoppedAt >= t0,
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
  ok(r.ok && row && row.stopReason === 'ended' && row.endedBy.kind === 'agent' && row.endedBy.actorId === `claude:${CALLER}` && row.endedBy.name === 'Manager' && row.stoppedAt >= t0 && row.name === 'Finished worker',
    'after an admitted end the stopped row carries reason ended, WHO (the asking conversation by id and name) and when — and the name it had', row);
  ok(Array.isArray(readDuring) && fs.existsSync(path.join(META, 'cw-3-1794880000003.json.stopped')), 'a session-list read DURING the kill did not eat the kept record (it was written after the session left the live map)', { readDuring: readDuring && readDuring.length });
  // CONTROL: registering the copy BEFORE the kill — the read during the kill consumes it (its conversation is still live)
  active.set('sess-x', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000d4', sockName: 'cw-4-1794880000004', name: 'Early' }));
  await api.keepEnded('cw-4-1794880000004', { backend: 'claude', backendSessionId: 'e2e00000-0000-4000-8000-0000000000d4', name: 'Early', cwd: '/tmp', mode: 'chat' }, { kind: 'agent', actorId: 'x', name: 'Manager' });
  duringKill = async () => { await api.stoppedSessions(); };
  await endSession({ sessionId: 'sess-x' });
  duringKill = null;
  ok(!(await rowOf('e2e00000-0000-4000-8000-0000000000d4')) && !fs.existsSync(path.join(META, 'cw-4-1794880000004.json.stopped')), 'CONTROL a record registered BEFORE the kill is CONSUMED by the read during it (its conversation was still live) — the order above is the cure');
  // a resume consumes it
  active.set('sess-r', session({ backendSessionId: 'e2e00000-0000-4000-8000-0000000000c3', sockName: 'cw-5-1794880000005' }));
  ok(!(await rowOf('e2e00000-0000-4000-8000-0000000000c3')), 'a resume (the conversation live again) consumes its ended record');
  active.delete('sess-r');
}

console.log('⑤ the words and the census of stopReason readers');
{
  const SW = await import(path.join(REPO, 'src/lib/stopped-why.js'));
  const a = SW.stoppedWhyOf({ status: 'stopped', stopReason: 'ended', stoppedAt: Date.now(), endedBy: { kind: 'agent', name: 'Manager' } });
  const p = SW.stoppedWhyOf({ status: 'stopped', stopReason: 'ended', stoppedAt: Date.now(), endedBy: { kind: 'person', name: null } });
  ok(/^Terminated by «Manager» at .+\.$/.test(a) && /^Terminated by hand at .+\.$/.test(p), 'the window\'s sentence names who ended it: «Terminated by «Manager» at …» / «Terminated by hand at …»', [a, p]);
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(zh.includes('"Terminated by «{name}» at {time}.": "{time} 由「{name}」终止。"') && ja.includes('"Terminated by hand at {time}.": "{time} に手動で終了しました。"'), 'both sentences in three languages (the design\'s words)');
  const BAN = /\b(sleep|asleep|hibernat\w*|suspend\w*|paus\w*)\b|睡眠|休眠|挂起|暂停|スリープ|休止/i;
  ok(![a, p, '{time} 由「{name}」终止。', '{time} 手动终止。', '{time} に「{name}」が終了しました。', '{time} に手動で終了しました。'].some((w) => BAN.test(w)), 'the words never say sleep');
  // the census: every src file that reads a SESSION's stopReason is a row; the model's own stop reason is another meaning
  const SESSION_READERS = ['src/server/boot-restore.js', 'src/routes/sessions.js', 'src/lib/stopped-why.js', 'src/lib/session-card.js', 'src/lib/chat-view.js', 'src/server/conversation-facts.js'];
  const OTHER_MEANING = { 'src/opencode-serve.js': 'the model\'s stop reason', 'src/harnesses/antigravity-wall.js': 'the model\'s stop reason', 'src/record-shape.js': 'a record field\'s name',
    'src/message-manager.js': 'the model\'s stop reason', 'src/codex-message-manager.js': 'the model\'s stop reason', 'src/acp-message-manager.js': 'the model\'s stop reason' };
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (e.name.endsWith('.js') && /\bstopReason\b/.test(fs.readFileSync(path.join(REPO, r), 'utf8'))) files.push(r); } };
  walk('src');
  const unlisted = files.filter((f) => !SESSION_READERS.includes(f) && !OTHER_MEANING[f]);
  const dead = [...SESSION_READERS, ...Object.keys(OTHER_MEANING)].filter((f) => !files.includes(f));
  ok(unlisted.length === 0 && dead.length === 0 && files.length >= 10, `the census of stopReason readers: ${SESSION_READERS.length} read a session's stop reason, ${Object.keys(OTHER_MEANING).length} another meaning — a new reader is RED until classified`, { unlisted, dead });
  const planted = [...files, 'src/lib/planted.js'].filter((f) => !SESSION_READERS.includes(f) && !OTHER_MEANING[f]);
  ok(planted.length === 1, 'CONTROL a planted fifth reader is caught');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
