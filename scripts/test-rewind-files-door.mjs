#!/usr/bin/env node
// test-rewind-files-door (fast, in-process — row B-437e, the files tier, U2's server half; 主开发 r1230 / r1232):
// src/server/rewind-files-door.js over the REAL normalizer (src/normalizers.js createMessageManager) and a scripted CLI
//   ① THE NORMALIZER: the CLI's `vsf-` answer routed to ONE rewind-files-answer meta; a tool result keeps the CLI's own time
//   ② THE CONFIRM: DARK without the conversation's checkpoint fact (nothing asked); with it the dry run under its own id (the
//      body the pure module spells), each file judged (the normalizer's records, the file's time), the choices and the default; a
//      dry run that refuses or does not answer in its bound: the conversation only, and why; a late answer dropped, said
//   ③ WHO: the person only — nothing asked of the CLI for anyone else
//   ④ THE PRESS: the dry run asked again (changed-since when it moved), the files, then the conversation (tier one's door), the
//      outcome; one press at a time; a files failure «some may have been put back»
//   ⑤ FILE TIMES: a paired machine through its agent's read-only stat (held ⇒ every file «could not be checked»); this machine
//      through the mount door and fsp.stat on a real file
//   RED CONTROLS (anchored copies): the press without its second dry run, the door without its dark check
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
const F = require(path.join(REPO, 'src/rewind-files.js'));
const { ok, report } = checker();
const M = mutantCopies('rewind-files-door', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/server/rewind-files-door.js'), 'utf8');
const HUMAN = Object.freeze({ kind: 'human', actBy: null });
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
  answer: (requestId, body) => ({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: body } }),
  error: (requestId, text) => ({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: text } }),
};
const DRY = (files = ['/w/a.js']) => ({ canRewind: true, filesChanged: files, insertions: 2, deletions: 1 });
/** a live conversation: the person's message (stamped), the agent's ONE Edit of a.js, its result; a scripted CLI answers each vsf- line */
function conv({ answers = [], fact = true, host = null } = {}) {
  const mm = createMessageManager('claude', 'rf-door-' + Math.random().toString(36).slice(2, 8));
  const ops = []; mm.onOp((o) => ops.push(o));
  for (const r of [REC.send('fix a.js', 'm-1'), REC.stamp('m-1', U(1)), REC.use(U(2), 'toolu_1', 'Edit', { file_path: '/w/a.js' }), REC.res(U(3), 'toolu_1', 10), REC.said('done', U(4)), REC.result()]) mm.processLive(r);
  const written = [], queue = [...answers];
  const session = { mode: 'chat', backend: 'claude', _normalizer: mm, ...(fact ? { _fileCheckpoints: true } : {}), ...(host ? { host } : {}),
    pty: { write: (line) => { written.push(line); let q = null; try { q = JSON.parse(line); } catch { } if (q && String(q.request_id || '').startsWith('vsf-') && queue.length) { const a = queue.shift(); if (a !== 'silent') setImmediate(() => mm.processLive(a.error ? REC.error(q.request_id, a.error) : REC.answer(q.request_id, a))); } } } };
  return { mm, ops, session, written, sent: () => written.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) };
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
  const r0 = await D.filesConfirmOf({ session: dark.session, msgId: 'm-1', by: HUMAN, stat: stat(MT) });
  ok(r0.ok && JSON.stringify(r0.choices) === '["conversation"]' && dark.written.length === 0, '② DARK: without the conversation\'s checkpoint fact (U1\'s) the conversation only — nothing is asked of the CLI', r0);
  const c = conv({ answers: [DRY()] });
  const r = await D.filesConfirmOf({ session: c.session, msgId: 'm-1', by: HUMAN, stat: stat(MT) });
  const q = c.sent()[0];
  console.log(`    (the ask: ${c.written[0]} · the answer to the page: ${JSON.stringify(r)})`);
  ok(!!q && q.type === 'control_request' && /^vsf-/.test(q.request_id) && JSON.stringify(q.request) === JSON.stringify(F.filesRequestOf(U(1), { dryRun: true })),
    '② the dry run goes out under its own vsf- id, its body the pure module\'s (the CLI\'s uuid of the person\'s message)');
  ok(r.ok && JSON.stringify(r.choices) === '["conversation","files","both"]' && r.default === 'both' && JSON.stringify(r.files) === '[{"path":"/w/a.js","state":"same","why":null}]' && r.plus === 2 && r.minus === 1,
    '② the confirm\'s facts: three choices, each file judged from the normalizer\'s records and its own time (one edit, its time at it: same), «both» preselected, the line counts');
  const c2 = conv({ answers: [DRY()] });
  const r2 = await D.filesConfirmOf({ session: c2.session, msgId: 'm-1', by: HUMAN, stat: stat({ '/w/a.js': at(30) }) });
  ok(r2.ok && r2.default === 'conversation' && r2.files[0].state === 'changed', '② a file written after the agent\'s edit: named changed, «the conversation only» preselected', r2);
  const c3 = conv({ answers: [{ canRewind: false, error: 'File rewinding is not enabled.' }] });
  const r3 = await D.filesConfirmOf({ session: c3.session, msgId: 'm-1', by: HUMAN, stat: stat(MT) });
  ok(r3.ok && JSON.stringify(r3.choices) === '["conversation"]' && r3.said === 'checkpoints-off', '② a dry run the CLI refuses: the conversation only, and why (its own words\' reason)', r3);
  const c4 = conv({ answers: ['silent'] });
  const r4 = await D.filesConfirmOf({ session: c4.session, msgId: 'm-1', by: HUMAN, stat: stat(MT), dryMs: 60 });
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
  const r = await D.filesConfirmOf({ session: c.session, msgId: 'm-1', by: null, stat: stat(MT) });
  const p = await D.pressFiles({ session: c.session, msgId: 'm-1', by: { kind: 'agent' }, choice: 'files', stat: stat(MT) });
  ok(!r.ok && r.reason === 'not-the-person' && !p.ok && p.reason === 'not-the-person' && c.written.length === 0, '③ only the person\'s own press: anyone else is refused by name and nothing is asked of the CLI', { r, p });
}

console.log('— ④ the press');
{
  const c = conv({ answers: [DRY()] });
  const drawn0 = await D.filesConfirmOf({ session: c.session, msgId: 'm-1', by: HUMAN, stat: stat(MT) });
  const drawn = { files: drawn0.files.map((x) => x.path), judged: drawn0.files, plus: drawn0.plus, minus: drawn0.minus };
  const p = conv({ answers: [DRY(), { canRewind: true, skippedLinks: 0 }] });
  const r = await D.pressFiles({ session: p.session, msgId: 'm-1', by: HUMAN, choice: 'both', drawn, lastSeenUuid: U(1), stat: stat(MT) });   // the newest person message the page shows (tier one's page-behind)
  const kinds = p.written.map((l) => { const q = JSON.parse(l); return q.request && q.request.subtype === 'rewind_files' ? (q.request.dry_run ? 'files-dry' : 'files-press') : q.request ? q.request.subtype : '?'; });
  console.log(`    (the press wrote: ${kinds.join(' → ')} · ${JSON.stringify(r.outcome)})`);
  ok(r.ok && JSON.stringify(kinds) === '["files-dry","files-press","rewind_conversation"]' && JSON.stringify(r.outcome) === '{"done":["files","conversation"],"failed":null,"notTried":[],"maybePartial":false}',
    '④ «both»: the dry run asked AGAIN and judged again, then the files, then the conversation (tier one\'s own door) — each result said', r);
  const moved = conv({ answers: [DRY(['/w/a.js', '/w/new.js'])] });
  const rm = await D.pressFiles({ session: moved.session, msgId: 'm-1', by: HUMAN, choice: 'both', drawn, stat: stat(MT) });
  ok(!rm.ok && rm.reason === 'changed-since' && moved.written.length === 1, '④ the files moved under the confirm (one more listed): refused changed-since — nothing put back, nothing rewound', rm);
  const one = conv({ answers: [DRY(), { canRewind: true, skippedLinks: 0 }] });
  const [a, b] = await Promise.all([D.pressFiles({ session: one.session, msgId: 'm-1', by: HUMAN, choice: 'files', drawn, stat: stat(MT) }), D.pressFiles({ session: one.session, msgId: 'm-1', by: HUMAN, choice: 'files', drawn, stat: stat(MT) })]);
  ok(a.ok && !b.ok && b.reason === 'pending', '④ one press at a time: a second while the first runs is refused (pending)', { a: a.ok, b });
  const fail = conv({ answers: [DRY(), { error: 'Failed to rewind: EACCES' }] });
  const rf = await D.pressFiles({ session: fail.session, msgId: 'm-1', by: HUMAN, choice: 'both', drawn, stat: stat(MT) });
  ok(rf.ok && rf.outcome.failed === 'files' && rf.outcome.maybePartial === true && JSON.stringify(rf.outcome.notTried) === '["conversation"]' && !fail.written.some((l) => /rewind_conversation/.test(l)),
    '④ the files press fails mid-way: «some files may have been put back», the conversation never asked', rf.outcome);
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
  ok(Math.round(local[f]) === at(10) && local[path.join(dir, 'gone.txt')] === null, '⑤ this machine: fsp.stat behind the mount door; a file that is not there ⇒ null', local);
}

console.log('— red controls');
{
  const noReask = M.load('src/server/rewind-files-door.js', anchored(SRC, "      if (!F.sameDrawOf(drawn, now2)) return", "      if (false) return", 'press without the re-check'), 'no-reask');
  const c = conv({ answers: [DRY(['/w/a.js', '/w/new.js']), { canRewind: true, skippedLinks: 0 }] });
  const drawn = { files: ['/w/a.js'], judged: [{ path: '/w/a.js', state: 'same', why: null }], plus: 2, minus: 1 };
  const r = await noReask.pressFiles({ session: c.session, msgId: 'm-1', by: HUMAN, choice: 'files', drawn, stat: stat(MT) });
  ok(r.ok === true && r.results.files.ok === true, 'RED CONTROL (the press without its re-check): files that moved under the confirm are put back');
  const noDark = M.load('src/server/rewind-files-door.js', anchored(SRC, "  if (session._fileCheckpoints !== true) return plain;   // DARK until U1: no files choice is ever drawn\n", '', 'no dark check'), 'no-dark');
  const d = conv({ fact: false, answers: [DRY()] });
  const rd = await noDark.filesConfirmOf({ session: d.session, msgId: 'm-1', by: HUMAN, stat: stat(MT) });
  ok(d.written.length === 1 && JSON.stringify(rd.choices) === '["conversation","files","both"]', 'RED CONTROL (no dark check): a conversation without the checkpoint fact is asked and offered the files');
}

report();
