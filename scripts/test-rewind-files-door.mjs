#!/usr/bin/env node
// test-rewind-files-door (fast, in-process — row B-437e, the files tier, U2's server half; 主开发 r1230 / r1232):
// src/server/rewind-files-door.js over the REAL normalizer (src/normalizers.js createMessageManager) and a scripted CLI
//   ① THE NORMALIZER: the CLI's `vsf-` answer routed to ONE rewind-files-answer meta; a tool result keeps the CLI's own time
//   ② THE CONFIRM: DARK without the conversation's checkpoint fact (nothing asked); with it the dry run under its own id (the
//      body the pure module spells), each file judged (the normalizer's records, the file's time), the choices and the default; a
//      dry run that refuses or does not answer in its bound: the conversation only, and why; a late answer dropped, said
//   ③ WHO: the person only — nothing asked of the CLI for anyone else
//   ④ THE PRESS: the dry run asked again (changed-since when it moved), the files, then the conversation (tier one's door), the
//      outcome; one press at a time; a files failure «some may have been put back». The reader's round (MAJOR 2, 3, MINOR 5–11,
//      NIT 13–14): «both» asks the conversation's own dry run FIRST (page-behind, its count: nothing written); DARK at the press
//      too; a files press is a rewind out for tier one, the confirm and the send fence; a press not answered in its bound holds
//      the mark until its late answer; the files id is the door's own; a choice that is none, a malformed draw: refused by name
//   ⑤ FILE TIMES: a paired machine through its agent's read-only stat (held ⇒ every file «could not be checked»); this machine
//      through the mount door and the door's own one-worker file pool on a real file
//   ⑥ WHOLE RECORDS (r1247): records that do not reach back to the start ⇒ every file could not be checked; born here (ws-create)
//      or rebuilt from the transcript's first byte (the store's span → rebuildHistory `fromStart`); the listener rides a REAL
//      rebuild; «No files were restored» read only from the program measured (the init's version)
//   RED CONTROLS (anchored copies): the press without its re-check, the door without its dark check, the press without both dark
//   gates, «both» without the conversation's dry run (first and right before the files), a files press tier one cannot see
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const D = require(path.join(REPO, 'src/server/rewind-files-door.js'));
const RQ = require(path.join(REPO, 'src/server/rewind-requests.js'));
const { rebuildHistory } = require(path.join(REPO, 'src/normalizers.js'));
const { createUserInputSender } = require(path.join(REPO, 'src/server/user-input.js'));
const senderOf = (mod, id, session) => mod.createUserInputSender({ activeSessions: new Map([[id, session]]), adapterRegistry: { get: () => null }, BUFFERS_DIR: os.tmpdir(), broadcastToSession() { }, feedLive() { }, autoResume: null, reattachLocalPty: () => false, ptyQuietSince: () => null, log() { } });
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const F = require(path.join(REPO, 'src/rewind-files.js'));
const { ok, report } = checker();
const M = mutantCopies('rewind-files-door', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/server/rewind-files-door.js'), 'utf8');
const HUMAN = Object.freeze({ kind: 'human', actBy: null });
// THE KEPT COPY (src/server/rewind-kept-door.js): every press keeps the listed files first — here in a scratch «hub data», the
// keep worker's own ops run inline (the listed /w/… paths do not exist: each is kept as «absent», which a put-back removes)
const KEEP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rfd-kept-'));
process.on('exit', () => { try { fs.rmSync(KEEP_ROOT, { recursive: true, force: true }); } catch { } });
const keepCall = (op, payload) => Promise.resolve().then(() => require(path.join(REPO, 'src/server/rewind-keep-worker.js')).runOp(op, payload).result);
const KA = Object.freeze({ conv: 'rf-door', keepOpts: Object.freeze({ dataRoot: KEEP_ROOT, call: keepCall }) });
const U = (n) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T0 = Date.parse('2026-11-21T09:00:00.000Z');
const at = (sec) => T0 + sec * 1000, iso = (sec) => new Date(at(sec)).toISOString();
const REC = {
  send: (text, msgId) => ({ type: 'user', message: { role: 'user', content: text }, msgId, timestamp: iso(0), _fromWebui: true }),
  stamp: (msgId, uuid) => ({ type: 'frame_stamp', msg_id: msgId, cli_uuid: uuid }),
  use: (uuid, id, name, input) => ({ type: 'assistant', uuid, message: { id: 'msg_' + uuid.slice(-4), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id, name, input }] } }),
  res: (uuid, id, sec, err) => ({ type: 'user', uuid, timestamp: iso(sec), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok', ...(err ? { is_error: true } : {}) }] } }),
  said: (text, uuid) => ({ type: 'assistant', uuid, message: { id: 'msg_' + uuid.slice(-4), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text }] } }),
  result: () => ({ type: 'result', subtype: 'success', is_error: false, result: '', session_id: 's' }),
  init: (v, skills) => ({ type: 'system', subtype: 'init', session_id: 's', cwd: '/w', model: 'claude-sonnet-4-5', tools: [], claude_code_version: v, ...(skills ? { skills } : {}) }),
  answer: (requestId, body) => ({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: body } }),
  empty: (requestId) => ({ type: 'control_response', response: { subtype: 'success', request_id: requestId } }),   // a success with no body
  error: (requestId, text) => ({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: text } }),
};
const DRY = (files = ['/w/a.js']) => ({ canRewind: true, filesChanged: files, insertions: 2, deletions: 1 });
/** a live conversation: the person's message (stamped), the agent's ONE Edit of a.js, its result; a scripted CLI answers each vsf- line.
 *  `whole`: born in this hub (src/ws-create.js marks its normalizer: every record seen); `cli`: the init's version (null: no init) */
function conv({ answers = [], fact = true, host = null, whole = true, cli = F.READ_CLI, skills = null } = {}) {   // a real conversation's init says its program
  const mm = createMessageManager('claude', 'rf-door-' + Math.random().toString(36).slice(2, 8));
  const ops = []; mm.onOp((o) => ops.push(o));
  const recs = [...(cli ? [REC.init(cli, skills)] : []), REC.send('fix a.js', 'm-1'), REC.stamp('m-1', U(1)), REC.use(U(2), 'toolu_1', 'Edit', { file_path: '/w/a.js' }), REC.res(U(3), 'toolu_1', 10), REC.said('done', U(4)), REC.result()];
  for (const r of recs) mm.processLive(r);
  if (whole) mm.recordsFromStart = true;
  const written = [], queue = [...answers];
  const session = { mode: 'chat', backend: 'claude', _normalizer: mm, _historyLoaded: true, ...(fact ? { _fileCheckpoints: true } : {}), ...(host ? { host } : {}),
    pty: { write: (line) => { written.push(line); let q = null; try { q = JSON.parse(line); } catch { } if (q && String(q.request_id || '').startsWith('vsf-') && queue.length) { const a = queue.shift(); if (a !== 'silent') setImmediate(() => mm.processLive(a === 'empty' ? REC.empty(q.request_id) : a.error ? REC.error(q.request_id, a.error) : REC.answer(q.request_id, a))); } } } };
  const pid = (mm.messages.find((m) => m && m.role === 'user') || {}).id;   // the person's card: the page names it by its id
  return { mm, ops, session, written, recs, pid, sent: () => written.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) };
}
const MT = { '/w/a.js': at(10) };
const stat = (times) => async (p) => (p in times ? times[p] : null);

console.log('— ① the normalizer');
{
  const c = conv();
  const tool = c.mm.messages.find((m) => m.role === 'tool');
  ok(!!tool && tool.content[0].type === 'tool_result' && tool.content[0].resultAt === at(10), '① a tool result keeps the CLI\'s own time of the result (resultAt, from its record\'s timestamp)', tool && tool.content[0]);
  c.mm.processLive(REC.answer('vsf-abc1', DRY()));
  const meta = c.ops.filter((o) => o.op === 'meta' && o.subtype === 'rewind-files-answer');
  ok(meta.length === 1 && meta[0].data.requestId === 'vsf-abc1' && JSON.stringify(meta[0].data.answer) === JSON.stringify(DRY()) && !c.ops.some((o) => o.op === 'meta' && o.subtype === 'rewind-answer'),
    '① the CLI\'s vsf- answer → ONE rewind-files-answer meta with the reply as it came (never tier one\'s rewind-answer)', meta);
}

console.log('— ② the confirm');
{
  const dark = conv({ fact: false });
  const r0 = await D.filesConfirmOf({ session: dark.session, msgId: dark.pid, by: HUMAN, ...KA, stat: stat(MT) });
  ok(r0.ok && JSON.stringify(r0.choices) === '["conversation"]' && dark.written.length === 0, '② DARK: without the conversation\'s checkpoint fact (U1\'s) the conversation only — nothing is asked of the CLI', r0);
  const c = conv({ answers: [DRY()] });
  const r = await D.filesConfirmOf({ session: c.session, msgId: c.pid, by: HUMAN, ...KA, stat: stat(MT) });
  const q = c.sent()[0];
  console.log(`    (the ask: ${c.written[0]} · the answer to the page: ${JSON.stringify(r)})`);
  ok(!!q && q.type === 'control_request' && /^vsf-/.test(q.request_id) && JSON.stringify(q.request) === JSON.stringify(F.filesRequestOf(U(1), { dryRun: true })),
    '② the dry run goes out under its own vsf- id, its body the pure module\'s (the CLI\'s uuid of the person\'s message)');
  ok(r.ok && JSON.stringify(r.choices) === '["conversation","files","both"]' && r.default === 'both' && JSON.stringify(r.files) === '[{"path":"/w/a.js","state":"same","why":null}]' && r.plus === 2 && r.minus === 1,
    '② the confirm\'s facts: three choices, each file judged from the normalizer\'s records and its own time (one edit, its time at it: same), «both» preselected, the line counts');
  const c2 = conv({ answers: [DRY()] });
  const r2 = await D.filesConfirmOf({ session: c2.session, msgId: c2.pid, by: HUMAN, ...KA, stat: stat({ '/w/a.js': at(30) }) });
  ok(r2.ok && r2.default === 'conversation' && r2.files[0].state === 'changed', '② a file written after the agent\'s edit: named changed, «the conversation only» preselected', r2);
  const c3 = conv({ answers: [{ canRewind: false, error: 'File rewinding is not enabled.' }] });
  const r3 = await D.filesConfirmOf({ session: c3.session, msgId: c3.pid, by: HUMAN, ...KA, stat: stat(MT) });
  ok(r3.ok && JSON.stringify(r3.choices) === '["conversation"]' && r3.said === 'checkpoints-off', '② a dry run the CLI refuses: the conversation only, and why (its own words\' reason)', r3);
  const c4 = conv({ answers: ['silent'] });
  const r4 = await D.filesConfirmOf({ session: c4.session, msgId: c4.pid, by: HUMAN, ...KA, stat: stat(MT), dryMs: 60 });
  const lateReq = c4.sent()[0].request_id;
  const warned = []; const w0 = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  c4.mm.processLive(REC.answer(lateReq, DRY()));
  console.warn = w0;
  ok(r4.ok && JSON.stringify(r4.choices) === '["conversation"]' && r4.said === 'no-answer' && warned.some((x) => /an answer nobody waits for/.test(x) && x.includes(lateReq.slice(0, 20))),
    '② a dry run with no answer in its bound: the conversation only, said (no-answer); its late answer is dropped and said in the journal', { r4, warned });
}

console.log('— ③ who');
{
  const c = conv({ answers: [DRY()] });
  const r = await D.filesConfirmOf({ session: c.session, msgId: c.pid, by: null, stat: stat(MT) });
  const p = await D.pressFiles({ session: c.session, msgId: c.pid, by: { kind: 'agent' }, choice: 'files', stat: stat(MT) });
  ok(!r.ok && r.reason === 'not-the-person' && !p.ok && p.reason === 'not-the-person' && c.written.length === 0, '③ only the person\'s own press: anyone else is refused by name and nothing is asked of the CLI', { r, p });
}

console.log('— ④ the press');
{
  const c = conv({ answers: [DRY()] });
  const drawn0 = await D.filesConfirmOf({ session: c.session, msgId: c.pid, by: HUMAN, ...KA, stat: stat(MT) });
  const drawn = { files: drawn0.files.map((x) => x.path), judged: drawn0.files, plus: drawn0.plus, minus: drawn0.minus };
  const p = conv({ answers: [DRY(), { canRewind: true, skippedLinks: 0 }] });
  const r = await D.pressFiles({ session: p.session, msgId: p.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(1), reqId: 'page-2', stat: stat(MT) });   // the newest person message the page shows (tier one's page-behind)
  const kinds = p.written.map((l) => { const q = JSON.parse(l); return q.request && q.request.subtype === 'rewind_files' ? (q.request.dry_run ? 'files-dry' : 'files-press') : q.request ? q.request.subtype : '?'; });
  console.log(`    (the press wrote: ${kinds.join(' → ')} · ${JSON.stringify(r.outcome)})`);
  const ids = p.sent().map((q) => q.request_id);
  ok(r.ok && JSON.stringify(kinds) === '["files-dry","files-press","rewind_conversation"]' && JSON.stringify(r.outcome) === '{"done":["files","conversation"],"failed":null,"notTried":[],"maybePartial":false}' && r.results.conversation.asked === true,
    '④ «both»: the dry run asked AGAIN and judged again, then the files, then the conversation (tier one\'s own door) — each result said; the conversation\'s «done» is its request ASKED (its answer is tier one\'s rewind-answer)', r);
  ok(/^vsf-/.test(ids[0]) && /^vsf-/.test(ids[1]) && ids[0] !== ids[1] && !ids[1].includes('page-2') && ids[2] === 'vsr-page-2' && RQ.filesOutOf(p.session) === null,
    '④ the files\' ids are the DOOR\'s own (a retry is never answered by an older press); the conversation step keeps tier one\'s rule (the page\'s own id); the files mark is released after the press', ids);
  const moved = conv({ answers: [DRY(['/w/a.js', '/w/new.js'])] });
  const rm = await D.pressFiles({ session: moved.session, msgId: moved.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(1), stat: stat(MT) });
  ok(!rm.ok && rm.reason === 'changed-since' && moved.written.length === 1, '④ the files moved under the confirm (one more listed): refused changed-since — nothing put back, nothing rewound', rm);
  const one = conv({ answers: [DRY(), { canRewind: true, skippedLinks: 0 }] });
  const [a, b] = await Promise.all([D.pressFiles({ session: one.session, msgId: one.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) }), D.pressFiles({ session: one.session, msgId: one.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) })]);
  ok(a.ok && !b.ok && b.reason === 'pending', '④ one press at a time: a second while the first runs is refused (pending)', { a: a.ok, b });
  const fail = conv({ answers: [DRY(), { error: 'Failed to rewind: EACCES' }] });
  const rf = await D.pressFiles({ session: fail.session, msgId: fail.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(1), stat: stat(MT) });
  ok(rf.ok && rf.outcome.failed === 'files' && rf.outcome.maybePartial === true && JSON.stringify(rf.outcome.notTried) === '["conversation"]' && !fail.written.some((l) => /rewind_conversation/.test(l)),
    '④ the files press fails mid-way: «some files may have been put back», the conversation never asked', rf.outcome);
}

{
  const drawn = { files: ['/w/a.js'], judged: [{ path: '/w/a.js', state: 'same', why: null }], plus: 2, minus: 1 };
  const PRESS = { canRewind: true, skippedLinks: 0 };
  // MAJOR 2: «both» asks the conversation's own dry run FIRST — a step that would be refused writes nothing
  const behind = conv({ answers: [DRY(), PRESS] }), cnt = conv({ answers: [DRY(), PRESS] });
  const rb = await D.pressFiles({ session: behind.session, msgId: behind.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(9), stat: stat(MT) });
  const rc = await D.pressFiles({ session: cnt.session, msgId: cnt.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(1), expectTaken: 99, stat: stat(MT) });
  ok(!rb.ok && rb.reason === 'page-behind' && behind.written.length === 0 && !rc.ok && rc.reason === 'changed-since' && cnt.written.length === 0 && rb.step === 'conversation' && rc.step === 'conversation',
    '④ «both» asks the CONVERSATION\'s own dry run first (the reader\'s MAJOR 2): a page behind the conversation, a count that moved — refused, and NOTHING was written (no file put back); each refusal marked the CONVERSATION\'s (r2245 (10): the page says it in tier one\'s words, never «the files changed»)', { rb, rc });
  // MAJOR 3: DARK at the press too
  const dk = conv({ fact: false, answers: [DRY(), PRESS] });
  const pf = await D.pressFiles({ session: dk.session, msgId: dk.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) });
  const pb = await D.pressFiles({ session: dk.session, msgId: dk.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(1), stat: stat(MT) });
  ok(!pf.ok && pf.reason === 'files-off' && !pb.ok && pb.reason === 'files-off' && dk.written.length === 0, '④ DARK AT THE PRESS (MAJOR 3): «files» and «both» on a conversation without the checkpoint fact — files-off, nothing asked of the CLI', { pf, pb });
  // MINOR 5: a files press is a rewind out — for tier one, the confirm and the person's send fence
  let open = null, reached = null;
  const gate = new Promise((r) => { open = r; }), atStat = new Promise((r) => { reached = r; });
  const mid = conv({ answers: [DRY(), PRESS] });
  const running = D.pressFiles({ session: mid.session, msgId: mid.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(1), stat: async (q) => { reached(); await gate; return MT[q] ?? null; } });
  await atStat;
  const t1 = RQ.requestRewind({ session: mid.session, msgId: mid.pid, lastSeenUuid: U(1), by: HUMAN }), fence = RQ.rewindFenceLeft(mid.session);
  const cm = await D.filesConfirmOf({ session: mid.session, msgId: mid.pid, by: HUMAN, ...KA, stat: stat(MT) });
  const markMid = RQ.filesOutOf(mid.session);
  open();
  const done = await running;
  const kinds = mid.sent().map((q) => (q.request && q.request.subtype === 'rewind_files' ? (q.request.dry_run ? 'files-dry' : 'files-press') : q.request ? q.request.subtype : '?'));
  console.log(`    (mid-press: tier one ${JSON.stringify(t1)} · the fence ${fence} ms · a confirm ${JSON.stringify(cm)} · then wrote ${kinds.join(' → ')})`);
  ok(!t1.ok && t1.reason === 'pending' && fence > 0 && !cm.ok && cm.reason === 'pending' && !!markMid && markMid.files === true && done.ok && JSON.stringify(kinds) === '["files-dry","files-press","rewind_conversation"]' && RQ.filesOutOf(mid.session) === null,
    '④ ONE REWIND AT A TIME across both tiers (MINOR 5): while a files press runs, tier one\'s press and a confirm are refused pending and the person\'s send waits (the fence); after it, the mark is gone');
  // MINOR 6: a press not answered in its bound — «some may have been put back», the mark HOLDS until its late answer
  const slow = conv({ answers: [DRY(), 'silent'] });
  const rs = await D.pressFiles({ session: slow.session, msgId: slow.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT), pressMs: 50 });
  const pressId = slow.sent()[1] && slow.sent()[1].request_id, heldMark = RQ.filesOutOf(slow.session), heldOut = !!RQ.rewindOut(slow.session);
  const warned = []; const w0 = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  slow.mm.processLive(REC.answer(pressId, PRESS));
  console.warn = w0;
  ok(rs.ok && rs.outcome.failed === 'files' && rs.outcome.maybePartial === true && !!heldMark && heldMark.id === pressId && heldOut && RQ.filesOutOf(slow.session) === null && warned.some((x) => /the press's late answer/.test(x) && x.includes(String(pressId).slice(0, 20))),
    '④ A PRESS NOT ANSWERED IN ITS BOUND (MINOR 6): «some files may have been put back», and the mark HOLDS (every other rewind waits) until its late answer — journalled, then released', { rs: rs.outcome, pressId, warned });
  // MINOR 11 + NIT 13: a choice that is none, a malformed draw — refused by name, nothing asked, no throw
  const bad = conv({ answers: [DRY(), PRESS] });
  const nc = await D.pressFiles({ session: bad.session, msgId: bad.pid, by: HUMAN, ...KA, choice: undefined, drawn, stat: stat(MT) });
  const md = await D.pressFiles({ session: bad.session, msgId: bad.pid, by: HUMAN, ...KA, choice: 'files', drawn: { files: 'x', judged: [null] }, stat: stat(MT) });
  const wsCase = read('src/ws-handler.js').split("case 'rewind-files': {")[1]?.split('break;')[0] || '';
  ok(!nc.ok && nc.reason === 'not-a-choice' && !md.ok && md.reason === 'changed-since' && bad.written.length === 1 && /choice: data\.choice,/.test(wsCase) && /reason: 'door-failed'/.test(wsCase),
    '④ a missing choice is not-a-choice (never «the conversation only» by default — the ws case passes it as it came); a malformed draw is changed-since (no throw); a door that throws is said to the page (door-failed)', { nc, md });
}

{
  // r1307: «sent false» on every refusal the door makes — nothing put back, and the outcome says so
  const drawn = { files: ['/w/a.js'], judged: [{ path: '/w/a.js', state: 'same', why: null }], plus: 2, minus: 1 };
  const PRESS = { canRewind: true, skippedLinks: 0 };
  const pressed = (c) => c.sent().filter((q) => q.request && q.request.subtype === 'rewind_files' && !q.request.dry_run).length;
  const cases = [];
  const dark = conv({ fact: false, answers: [DRY(), PRESS] }); cases.push(['dark', dark, await D.pressFiles({ session: dark.session, msgId: dark.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) })]);
  const behind = conv({ answers: [DRY(), PRESS] }); cases.push(['page behind', behind, await D.pressFiles({ session: behind.session, msgId: behind.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(9), stat: stat(MT) })]);
  const moved = conv({ answers: [DRY(['/w/a.js', '/w/b.js']), PRESS] }); cases.push(['changed since', moved, await D.pressFiles({ session: moved.session, msgId: moved.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) })]);
  const none = conv({ answers: [DRY(), PRESS] }); cases.push(['not a choice', none, await D.pressFiles({ session: none.session, msgId: none.pid, by: HUMAN, ...KA, choice: 'all', drawn, stat: stat(MT) })]);
  const out = conv({ answers: [DRY(), PRESS] }); RQ.setFilesOut(out.session, { id: 'x', at: Date.now(), files: true }); cases.push(['a rewind out', out, await D.pressFiles({ session: out.session, msgId: out.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) })]); RQ.setFilesOut(out.session, null);
  const broken = conv({ answers: [DRY(), PRESS] }); const w0 = broken.session.pty.write;
  broken.session.pty.write = (line) => { const q = JSON.parse(line); if (q.request && q.request.subtype === 'rewind_files' && !q.request.dry_run) throw new Error('EPIPE'); return w0(line); };
  const rb = await D.pressFiles({ session: broken.session, msgId: broken.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) });
  console.log(`    (the door's refusals: ${cases.map(([n, , r]) => `${n} → ${r.reason}`).join(' · ')} · a press whose write failed → ${JSON.stringify(rb.results && rb.results.files)})`);
  ok(cases.every(([, c, r]) => r.ok === false && pressed(c) === 0 && !r.results) && rb.ok && rb.results.files.sent === false && rb.results.files.ok === false && rb.outcome.maybePartial === false && pressed(broken) === 0,
    '④ «SENT FALSE» ON EVERY REFUSAL THE DOOR MAKES (r1307): dark, a page behind, changed since, not a choice, a rewind out — refused with nothing pressed; a press whose write failed carries sent: false, and the outcome says «nothing put back»');
  // ITS READER's round (the second follow): an agent's dispatch held while a FILES press is out; the mark tied to its CLI process
  const fd = conv();
  const typing = senderOf({ createUserInputSender }, 'rf-fence', fd.session);
  const before = typing.send('rf-fence', '/compact', { origin: 'dispatch' });
  RQ.setFilesOut(fd.session, { id: 'vsf-x', at: Date.now(), files: true, pty: fd.session.pty });
  const during = typing.send('rf-fence', '/compact', { origin: 'dispatch' });
  fd.session.pty = { write: () => { } };   // a new CLI process (a respawn)
  const respawned = RQ.filesOutOf(fd.session), afterRespawn = typing.send('rf-fence', '/compact', { origin: 'dispatch' });
  RQ.setFilesOut(fd.session, null);
  console.log(`    (dispatch: before ${before.code || 'past the fence'} · during a files press ${during.code} · after a respawn ${afterRespawn.code || 'past the fence'})`);
  ok(before.code !== 'rewind_out' && during.ok === false && during.code === 'rewind_out' && respawned === null && afterRespawn.code !== 'rewind_out',
    '④ AN AGENT\'s DISPATCH (a compaction) WAITS while a files press is out — it would leave «both» half done; the mark is TIED to its CLI process: a respawn leaves none behind');
  // «both» asks the conversation AGAIN right before the files: a person message that arrived during the judge refuses here
  let open2 = null, reached2 = null;
  const gate2 = new Promise((r) => { open2 = r; }), atStat2 = new Promise((r) => { reached2 = r; });
  const mv = conv({ answers: [DRY(), PRESS] });
  const pr2 = D.pressFiles({ session: mv.session, msgId: mv.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(1), stat: async (q) => { reached2(); await gate2; return MT[q] ?? null; } });
  await atStat2;
  mv.mm.processLive(REC.send('and one more thing', 'm-9')); mv.mm.processLive(REC.stamp('m-9', U(9)));   // a message arrived while the files were judged
  open2();
  const r2 = await pr2;
  console.log(`    (a message during the judge: refused ${r2.reason})`);
  ok(!r2.ok && pressed(mv) === 0 && RQ.filesOutOf(mv.session) === null, '④ «both» ASKS THE CONVERSATION AGAIN right before the files (its reader): a message that arrived while the files were judged — refused by the conversation\'s own verdict, NOTHING put back, the mark released', r2);
  // a press answered with an EMPTY body: answered — never a mark held ten minutes
  const em = conv({ answers: [DRY(), 'empty'] });
  const re = await D.pressFiles({ session: em.session, msgId: em.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT), pressMs: 5000 });
  ok(re.ok && re.results.files.ok === false && re.results.files.reason === 'no-answer' && re.outcome.maybePartial === true && RQ.filesOutOf(em.session) === null,
    '④ a press ANSWERED WITH NO BODY: «some files may have been put back» (no-answer), and the mark released at once (its reader: it was held ten minutes)', re.results.files);
  // the hold's own bound: a press never answered releases its mark when the hold ends
  const hd = conv({ answers: [DRY(), 'silent'] });
  const rh = await D.pressFiles({ session: hd.session, msgId: hd.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT), pressMs: 20, holdMs: 1 });
  const heldAt = RQ.filesOutOf(hd.session);
  while (RQ.filesOutOf(hd.session)) await new Promise((r) => setTimeout(r, 5));   // waits for what happens: the hold's end
  ok(rh.ok && rh.outcome.maybePartial === true && !!heldAt && RQ.filesOutOf(hd.session) === null, '④ a press never answered: the mark held, then released when its hold ends (its reader: no leg had it)');
  // THE KEPT COPY: the press keeps every listed file before rewind_files — a keep that fails sends nothing
  const kp = conv({ answers: [DRY(), PRESS] });
  const rk = await D.pressFiles({ session: kp.session, msgId: kp.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) });
  const failing = (op, payload) => (op === 'facts' ? Promise.resolve(payload.paths.map((p) => ({ path: p, error: 'EACCES' }))) : keepCall(op, payload));
  const kf = conv({ answers: [DRY(), PRESS] });
  const rf2 = await D.pressFiles({ session: kf.session, msgId: kf.pid, by: HUMAN, conv: 'rf-door', keepOpts: { dataRoot: KEEP_ROOT, call: failing }, choice: 'files', drawn, stat: stat(MT) });
  const kc = conv({ answers: [DRY()] });
  const cf = await D.filesConfirmOf({ session: kc.session, msgId: kc.pid, by: HUMAN, conv: 'rf-door', keepOpts: { dataRoot: KEEP_ROOT, call: failing }, stat: stat(MT) });
  const sealed = rk.ok && rk.results.kept && fs.existsSync(path.join(rk.results.kept.where, '.vibespace-rewind-kept'));
  ok(rk.ok && sealed && rk.results.kept.check === 'sha256' && pressed(kp) === 1 && !rf2.ok && rf2.reason === 'not-kept' && rf2.keep[0].why === 'unreadable' && pressed(kf) === 0
    && cf.ok && cf.default === 'conversation' && cf.keep.ok === false,
    '④ THE KEPT COPY (r1247 (2)): the press KEEPS every listed file first and names where (sealed, sha256); a file that cannot be kept: the press refused not-kept, NOTHING pressed; the confirm says so and draws «the conversation only»', { rk: rk.results && rk.results.kept, rf2, cf: cf.keep });
}

{
  // r2245 (6) + (7): the confirm NAMES a paired machine (its keep's own); a press that throws AFTER its keep says what is known and
  // its line still gets its door (a seven-day copy with no door is a lost door)
  const drawn = { files: ['/w/a.js'], judged: [{ path: '/w/a.js', state: 'same', why: null }], plus: 2, minus: 1 };
  const PRESS = { canRewind: true, skippedLinks: 0 };
  const KD = require(path.join(REPO, 'src/server/rewind-kept-door.js'));   // the door's own module (its confirm asks it)
  const keepable = KD.keepableOf;
  let cm = null;
  KD.keepableOf = async () => ({ ok: true, refusals: [], check: 'size', machine: 'h-2' });   // a paired machine's keep, as its road says it
  try { const c = conv({ answers: [DRY()] }); cm = await D.filesConfirmOf({ session: c.session, msgId: c.pid, by: HUMAN, ...KA, hosts: { get: (id) => (id === 'h-2' ? { name: 'the lab machine' } : null) }, stat: stat(MT) }); }
  finally { KD.keepableOf = keepable; }
  const ch = conv({ answers: [DRY()] }), chm = await D.filesConfirmOf({ session: ch.session, msgId: ch.pid, by: HUMAN, ...KA, stat: stat(MT) });
  ok(!!cm && cm.ok && cm.machine === 'the lab machine' && chm.ok && chm.machine === null,
    '④ THE CONFIRM NAMES THE MACHINE (r2245 (6)): a copy kept on a paired machine reads «kept on <its name>» (the hosts\' own name); this hub\'s: no machine', { cm: cm && cm.machine, chm: chm.machine });
  const made = F.filesRequestOf;
  let th = null;
  const tc = conv({ answers: [DRY(), PRESS] });
  F.filesRequestOf = (uuid, o) => { if (o && o.dryRun) return made(uuid, o); throw new Error('planted: the press failed after its keep'); };
  try { th = await D.pressFiles({ session: tc.session, msgId: tc.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) }); }
  finally { F.filesRequestOf = made; }
  const told = [];
  const tl = th && th.results && th.results.kept ? await KD.afterFilesPress(tc.session, 'rf-door', th, { broadcastToSession: (s, i, fr) => told.push(fr), now: Date.now(), dataRoot: KEEP_ROOT, call: keepCall }) : null;
  ok(!!th && th.ok === false && th.reason === 'door-failed' && !!th.results.kept && Number(th.results.kept.msgAt) > 1e12 && Number(th.results.kept.msgAt) <= Date.now() && th.outcome.maybePartial === true && RQ.filesOutOf(tc.session) === null
    && !!tl && tl.door === true && tl.step === 'partial' && told.length === 1 && told[0].data.door === true,
    '④ A PRESS THAT THROWS AFTER ITS KEEP (r2245 (7)): the answer says the copy stands and that some files may have been put back; its line is written and told WITH its door; the mark released; the message\'s time is in MILLISECONDS (r2372: the sentence names its date)', { th: th && { reason: th.reason, outcome: th.outcome }, tl });
  const oc = conv({ answers: [DRY()] });
  const ro = await D.pressFiles({ session: oc.session, msgId: oc.pid, by: HUMAN, ...KA, choice: 'conversation', lastSeenUuid: U(9), stat: stat(MT) });
  ok(!ro.ok && ro.reason === 'page-behind' && ro.step === 'conversation', '④ «THE CONVERSATION ONLY» refused by tier one\'s door: marked the conversation\'s too (r2245 (10)) — the page says it in tier one\'s words', ro);
  // r4423 MUST 1: a conversation with NO addressable id yet (a pending fork: no key) — its files press keeps and puts back nothing,
  // refused by name; its confirm draws the conversation only and says why
  const nk = conv({ answers: [DRY(), PRESS] }), nkc = conv({ answers: [DRY()] });
  const rnk = await D.pressFiles({ session: nk.session, msgId: nk.pid, by: HUMAN, conv: null, keepOpts: KA.keepOpts, choice: 'files', drawn, stat: stat(MT) });
  const cnk = await D.filesConfirmOf({ session: nkc.session, msgId: nkc.pid, by: HUMAN, conv: null, keepOpts: KA.keepOpts, stat: stat(MT) });
  const pressedNk = (c) => c.sent().filter((q) => q.request && q.request.subtype === 'rewind_files' && !q.request.dry_run).length;
  ok(!rnk.ok && rnk.reason === 'not-started' && pressedNk(nk) === 0 && cnk.ok && cnk.default === 'conversation' && cnk.keep.ok === false && cnk.keep.refusals[0].why === 'not-started',
    '④ A CONVERSATION WITH NO ADDRESSABLE ID YET (r4423: a pending fork has no key): its files press is refused «not started» and nothing is pressed or kept; its confirm draws the conversation only and says why', { rnk: rnk.reason, keep: cnk.keep });
}

console.log('— ⑤ file times');
{
  const hosts = (dm) => ({ deviceBounded: async () => dm });
  const paired = await D.timesOf({ host: 'h-2' }, ['/w/a.js', '/w/b.js'], { hosts: hosts({ fsStat: async (p) => (p === '/w/a.js' ? { ok: true, stat: { mtimeMs: at(10), isDir: false } } : { ok: false }) }) });
  const held = await D.timesOf({ host: 'h-2' }, ['/w/a.js'], { hosts: { deviceBounded: async () => { throw Object.assign(new Error('held'), { code: 'hosts-unread' }); } } });
  const slow = await D.timesOf({ host: 'h-2' }, ['/w/a.js'], { hosts: hosts({ fsStat: () => new Promise(() => { }) }), statMs: 40 });
  ok(paired['/w/a.js'] === at(10) && paired['/w/b.js'] === null && held['/w/a.js'] === null && slow['/w/a.js'] === null,
    '⑤ a paired machine: its agent\'s read-only stat (mtimeMs); no answer, a held machines list, an answer past its bound ⇒ null (could not be checked)', { paired, held, slow });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rfd-')), f = path.join(dir, 'x.txt');
  fs.writeFileSync(f, 'x'); fs.utimesSync(f, new Date(at(10)), new Date(at(10)));
  const local = await D.timesOf({}, [f, path.join(dir, 'gone.txt')]);
  fs.rmSync(dir, { recursive: true, force: true });
  // ONE AFTER ANOTHER: /w/1 answers only once /w/2 is asked — all at once (the old road) it reads; one after another it reaches its
  // own bound first («could not be checked») and /w/2 then reads
  let release1 = null; const p1 = new Promise((r) => { release1 = r; });
  const seq = await D.timesOf({}, ['/w/1', '/w/2'], { stat: (p) => (p === '/w/1' ? p1.then(() => at(10)) : (release1(), Promise.resolve(at(20)))), statMs: 40, judgeMs: 5000 });
  const all = await D.timesOf({}, ['/w/1', '/w/2', '/w/3'], { stat: async () => at(10), statMs: 40, judgeMs: 5000 });
  const spent = await D.timesOf({}, ['/w/1', '/w/2'], { stat: () => new Promise(() => { }), statMs: 5000, judgeMs: 40 });
  ok(seq['/w/1'] === null && seq['/w/2'] === at(20) && Object.values(all).every((v) => v === at(10)) && Object.values(spent).every((v) => v === null),
    '⑤ ONE AFTER ANOTHER under ONE bound (its reader: JUDGE_MS never applied): a file is asked only when the one before it answered or reached its own bound; once the bound for all is spent, the rest read «could not be checked»', { seq, all, spent });
  ok(Math.round(local[f]) === at(10) && local[path.join(dir, 'gone.txt')] === null && !/\bfsp?\.(?:promises\.)?stat\(|require\('fs\/promises'\)/.test(SRC) && /new SafeFs\(\{ name: 'rewind-stat', poolSize: 1/.test(SRC),
    '⑤ this machine: the door\'s own ONE-WORKER file pool behind the mount door (a hung storage ends a worker, never a thread of the hub\'s shared pool — MINOR 8); a file that is not there ⇒ null', local);
}

console.log('— ⑥ whole records, the version');
{
  const tail = conv({ answers: [DRY()], whole: false });
  const rt = await D.filesConfirmOf({ session: tail.session, msgId: tail.pid, by: HUMAN, ...KA, stat: stat(MT) });
  ok(rt.ok && rt.default === 'conversation' && rt.files.length === 1 && rt.files.every((x) => x.state === 'unknown' && x.why === 'records-cut'),
    '⑥ records that do not reach back to the conversation\'s start (a history rebuilt from a transcript\'s tail): every file could not be checked, «the conversation only» drawn (r1247)', rt);
  const rbc = conv({ answers: ['silent'] });
  const pending = D.filesConfirmOf({ session: rbc.session, msgId: rbc.pid, by: HUMAN, ...KA, stat: stat(MT) });
  const dryId = rbc.sent()[0] && rbc.sent()[0].request_id;
  rbc.session._historyLoaded = false;
  await rebuildHistory(rbc.session, 'rf-rebuild', rbc.recs, { fromStart: true });
  const after = rbc.session._normalizer;
  after.processLive(REC.answer(dryId, DRY()));
  const rr = await pending;
  const s2 = { backend: 'claude', _normalizer: createMessageManager('claude', 'rf-rebuild-2'), _historyLoaded: false };
  await rebuildHistory(s2, 'rf-rebuild-2', rbc.recs, {});
  ok(after !== rbc.mm && after.recordsFromStart === true && rbc.session._historyLoaded === true && rr.ok && rr.choices.length === 3 && rr.files[0].state === 'same' && s2._normalizer.recordsFromStart === false,
    '⑥ a REAL history rebuild (NIT 14): the answer of an ask in flight reaches the door through the rebuilt normalizer (the listener rides it); a rebuild told its records start at the transcript\'s first byte keeps them whole — one not told: not whole', { rr, flag: after.recordsFromStart, s2: s2._normalizer.recordsFromStart });
  const store = read('src/session-store.js'), wc = read('src/ws-create.js'), wh = read('src/ws-handler.js');
  const SS = require(path.join(REPO, 'src/session-store.js')), arr = [{ type: 'user' }];
  const spans = [[{ messages: arr, spanStart: 0 }, arr, true], [{ messages: arr, spanStart: 33554432 }, arr, false], [null, arr, false], [{ messages: [...arr], spanStart: 0 }, arr, false]].map(([e, j, want]) => SS._spanFromStart(e, j) === want);
  ok(spans.every(Boolean), '⑥ «whole» only when the store\'s span reaches the start (r1307): the parse IS the cache entry\'s array and its span starts at byte 0 — a tail read (span past 0), no entry, another array: not whole', spans);
  ok(/this\._fromStart = spanFromStart\(historySessionId \? \(_jsonlCache\.get\(historySessionId\) \|\| _handoffGet\(historySessionId\)\) : null, jsonl\);/.test(store) && /get fromStart\(\) \{ this\._ensureParsed\(\); return this\._fromStart === true; \}/.test(store)
    && /fromStart: sm\.fromStart === true && !session\.host(?:, notLoaded: [^\n]*?)? \}\);/.test(wh) && /\{ session\._historyLoaded = true; session\._normalizer\.recordsFromStart = true; \}/.test(wc),
    '⑥ THE WIRING: the session store says its records reach the transcript\'s first byte (the span the tail reader kept starts at 0), the attach rebuild passes it on, a conversation born here is whole from its birth');
  const v1 = conv({ answers: [DRY(), { error: 'Failed to rewind: No files were restored: 1 file failed (backup missing, or the file could not be updated)' }], cli: '2.1.322' });
  const v2 = conv({ answers: [DRY(), { error: 'Failed to rewind: No files were restored: 1 file failed (backup missing, or the file could not be updated)' }], cli: '2.1.399' });
  const drawn = { files: ['/w/a.js'], judged: [{ path: '/w/a.js', state: 'same', why: null }], plus: 2, minus: 1 };
  const drawnUnread = { ...drawn, judged: [{ path: '/w/a.js', state: 'unknown', why: 'version-unread' }] };
  const o1 = await D.pressFiles({ session: v1.session, msgId: v1.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) });
  const o2 = await D.pressFiles({ session: v2.session, msgId: v2.pid, by: HUMAN, ...KA, choice: 'files', drawn: drawnUnread, stat: stat(MT) });
  const v3 = conv({ answers: [DRY()], cli: '2.1.399' }), v4 = conv({ answers: [DRY()], cli: null });
  const c3 = await D.filesConfirmOf({ session: v3.session, msgId: v3.pid, by: HUMAN, ...KA, stat: stat(MT) }), c4 = await D.filesConfirmOf({ session: v4.session, msgId: v4.pid, by: HUMAN, ...KA, stat: stat(MT) });
  const v5 = conv({ answers: [DRY()], skills: ['Edit'] });
  const c5 = await D.filesConfirmOf({ session: v5.session, msgId: v5.pid, by: HUMAN, ...KA, stat: stat(MT) });
  ok(c5.ok && c5.files[0].why === 'helper-worked' && c5.default === 'conversation', '⑥ THE CONVERSATION\'S OWN SKILLS (r1332 (6)): its init lists a name among its skills — that name is a helper whatever the table says (here the edit tool itself): every file «could not be checked»', c5.files);
  ok([c3, c4].every((c) => c.ok && c.default === 'conversation' && c.files.length === 1 && c.files[0].why === 'version-unread'),
    '⑥ THE VERSION FROM THE INIT RECORD (r1307): a conversation whose init said 2.1.399, or no init at all — every file «could not be checked» (version-unread), «the conversation only» drawn', { c3, c4 });
  ok(o1.ok && o1.outcome.failed === 'files' && o1.outcome.maybePartial === false && o2.ok && o2.outcome.maybePartial === true,
    '⑥ «No files were restored» read as «nothing put back» only from the program measured — the conversation\'s init said 2.1.322; the same words from 2.1.399: «some may have been put back» (r1247)', { o1: o1.outcome, o2: o2.outcome });
}

console.log('— red controls');
{
  const noReask = M.load('src/server/rewind-files-door.js', anchored(SRC, "    if (!drawnOk(drawn) || !F.sameDrawOf(drawn, now2)) return", "    if (false) return", 'press without the re-check'), 'no-reask');
  const c = conv({ answers: [DRY(['/w/a.js', '/w/new.js']), { canRewind: true, skippedLinks: 0 }] });
  const drawn = { files: ['/w/a.js'], judged: [{ path: '/w/a.js', state: 'same', why: null }], plus: 2, minus: 1 };
  const r = await noReask.pressFiles({ session: c.session, msgId: c.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) });
  ok(r.ok === true && r.results.files.ok === true, 'RED CONTROL (the press without its re-check): files that moved under the confirm are put back');
  const noDark = M.load('src/server/rewind-files-door.js', anchored(SRC, "  if (session._fileCheckpoints !== true) return plain;   // DARK until U1: no files choice is ever drawn\n", '', 'no dark check'), 'no-dark');
  const d = conv({ fact: false, answers: [DRY()] });
  const rd = await noDark.filesConfirmOf({ session: d.session, msgId: d.pid, by: HUMAN, ...KA, stat: stat(MT) });
  ok(d.written.length === 1 && JSON.stringify(rd.choices) === '["conversation","files","both"]', 'RED CONTROL (no dark check): a conversation without the checkpoint fact is asked and offered the files');
  const PRESS = { canRewind: true, skippedLinks: 0 };
  const noDarkPress = M.load('src/server/rewind-files-door.js', anchored(anchored(SRC, "  if (session._fileCheckpoints !== true) return { ok: false, reason: 'files-off', cls: F.FILES_REFUSALS['files-off'] };   // DARK until U1\n", '', 'press dark gate'),
    "fileCheckpoints: session._fileCheckpoints === true }, choice, j.dry);", 'fileCheckpoints: true }, choice, j.dry);', 'press verdict fact'), 'no-dark-press');
  const dp = conv({ fact: false, answers: [DRY(), PRESS] });
  await noDarkPress.pressFiles({ session: dp.session, msgId: dp.pid, by: HUMAN, ...KA, choice: 'files', drawn, stat: stat(MT) });
  ok(dp.sent().some((q) => q.request && q.request.subtype === 'rewind_files' && !q.request.dry_run), 'RED CONTROL (the press without BOTH dark gates — its own and the verdict\'s fact): a conversation without the checkpoint fact has its files put back');
  // the second follow re-asks the conversation right before the files: removing the FIRST ask alone is caught there (nothing put back);
  // the half-done press MAJOR 2 named needs BOTH asks gone
  const noFirst = M.load('src/server/rewind-files-door.js', anchored(anchored(SRC, "    if (!c.ok) return { ...c, step: 'conversation' };", '', 'both without the conversation first'), "      if (!c2.ok) return { ...c2, step: 'conversation' };", '', 'nor its re-ask'), 'no-conversation-first');
  const nf = conv({ answers: [DRY(), PRESS] });
  const rnf = await noFirst.pressFiles({ session: nf.session, msgId: nf.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(9), stat: stat(MT) });
  ok(nf.sent().some((q) => q.request && q.request.subtype === 'rewind_files' && !q.request.dry_run) && rnf.ok && rnf.outcome.failed === 'conversation',
    'RED CONTROL («both» without the conversation\'s dry run — neither first nor right before the files): a page behind the conversation has its files put back, then the conversation step is refused — the half-done press MAJOR 2 named');
  const USRC = read('src/server/user-input.js');
  const unfenced = M.load('src/server/user-input.js', anchored(USRC, "    const fence = origin !== 'dispatch' ? RQF.rewindFenceLeft(session) : RQF.filesOutOf(session) ? RQF.rewindFenceLeft(session) : 0;", "    const fence = origin !== 'dispatch' ? RQF.rewindFenceLeft(session) : 0;", 'dispatch unfenced'), 'dispatch-unfenced');
  const ud = conv(); RQ.setFilesOut(ud.session, { id: 'vsf-y', at: Date.now(), files: true, pty: ud.session.pty });
  const passed = senderOf(unfenced, 'rf-unf', ud.session).send('rf-unf', '/compact', { origin: 'dispatch' }); RQ.setFilesOut(ud.session, null);
  ok(passed.code !== 'rewind_out', 'RED CONTROL (an agent\'s dispatch unfenced): a compaction goes out while a files press puts files back');
  const noRecheck = M.load('src/server/rewind-files-door.js', anchored(SRC, "      if (!c2.ok) return { ...c2, step: 'conversation' };", '', 'no re-check before the press'), 'no-recheck');
  let open3 = null, reached3 = null;
  const gate3 = new Promise((r) => { open3 = r; }), atStat3 = new Promise((r) => { reached3 = r; });
  const nr = conv({ answers: [DRY(), PRESS] });
  const pr3 = noRecheck.pressFiles({ session: nr.session, msgId: nr.pid, by: HUMAN, ...KA, choice: 'both', drawn, lastSeenUuid: U(1), stat: async (q) => { reached3(); await gate3; return MT[q] ?? null; } });
  await atStat3; nr.mm.processLive(REC.send('and one more thing', 'm-9')); nr.mm.processLive(REC.stamp('m-9', U(9))); open3(); await pr3;
  ok(nr.sent().some((q) => q.request && q.request.subtype === 'rewind_files' && !q.request.dry_run), 'RED CONTROL (no re-check before the press): a message that arrived during the judge — the files are put back, then the conversation step refused');
  const noKeep = M.load('src/server/rewind-files-door.js', anchored(SRC, "    if (!kept.ok) return { ok: false, reason: 'not-kept', cls: 'cannot', keep: kept.refusals };\n", '', 'press without its keep'), 'no-keep');
  const nk = conv({ answers: [DRY(), PRESS] });
  const failingKeep = (op, payload) => (op === 'facts' ? Promise.resolve(payload.paths.map((p) => ({ path: p, error: 'EACCES' }))) : keepCall(op, payload));
  await noKeep.pressFiles({ session: nk.session, msgId: nk.pid, by: HUMAN, conv: 'rf-door', keepOpts: { dataRoot: KEEP_ROOT, call: failingKeep }, choice: 'files', drawn, stat: stat(MT) });
  ok(nk.sent().some((q) => q.request && q.request.subtype === 'rewind_files' && !q.request.dry_run), 'RED CONTROL (the press without its keep\'s refusal): a file that could not be kept is put back anyway');
  const RSRC = read('src/server/rewind-requests.js');
  const blind = M.load('src/server/rewind-requests.js', anchored(RSRC, 'function rewindOut(session, now = Date.now()) { return filesOutOf(session) || conversationOut(session, now); }', 'function rewindOut(session, now = Date.now()) { return conversationOut(session, now); }', 'files press unseen'), 'files-out-unseen');
  const bl = conv(), mark = { id: null, at: Date.now(), files: true };
  blind.setFilesOut(bl.session, mark);
  const rbl = blind.requestRewind({ session: bl.session, msgId: bl.pid, lastSeenUuid: U(1), by: HUMAN });
  const real = conv(); RQ.setFilesOut(real.session, mark);
  const rreal = RQ.requestRewind({ session: real.session, msgId: real.pid, lastSeenUuid: U(1), by: HUMAN });
  ok(rbl.ok === true && bl.written.some((l) => /rewind_conversation/.test(l)) && !rreal.ok && rreal.reason === 'pending' && real.written.length === 0,
    'RED CONTROL (a files press tier one cannot see): with a files press out, tier one\'s press goes out beside it — the real door refuses it pending');
}

report();
