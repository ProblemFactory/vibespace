#!/usr/bin/env node
// AGENT FEEDBACK — THE MODEL (lane agent-feedback, the owner 2026-10-18: agents report a CLI / flow / UI that felt wrong
// with `vibespace-feedback`, the owner reads the reports in ⚙ System ▸ Agent feedback…). Fast, PURE, in-process:
//   ① validate: the body's three fields — text 1–2000 chars (trimmed, controls stripped, CJK counted as one), about ≤ 60,
//      kind ∈ cli|flow|ui|docs|other (default other); every refusal by NAME (never a silent cut)
//   ② makeRecord: the route's facts (session, group, harness, instance) land as given, cleaned; the body never names them
//   ③ fold — the dedup: same normalized text + about, last seen within 24 h, ANY session ⇒ count + 1 on the existing
//      record (reporters kept, ≤ 50); 24 h after the last report, or another about, is a new record
//   ④ fold — the ring: ≤ 500 records; the least recently reported one is dropped (open OR handled) and named in `dropped`
//   ⑤ setStatus / publicRow / isMine / byNewest / openCount / paceVerdict — lane feedback-handled-verb: a handled record
//      names the release that shipped the fix + a note (refused by name when malformed); a reopen clears them
// Run: node scripts/test-feedback-model.mjs
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = require(path.join(REPO, 'src/feedback-model.js'));

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const H = 3600e3;
const FACTS = { session: { id: 'cid-a', name: 'lane a' }, group: { id: 'T-1', name: 'VibeSpace 车道' }, harness: 'claude', instance: { name: 'box', version: '2.369.301' } };
const rec = (text, { about = '', kind = 'cli', at = 1e12, id = 'fb-' + Math.random().toString(16).slice(2, 10), facts = FACTS } = {}) => M.makeRecord(M.validate({ text, about, kind }).value, facts, { id, now: at });

console.log('— ① validate');
{
  const v = M.validate({ text: '  the usage of\u0007 vibespace-task\r\nlies ‮about --group  ', about: '  vibespace-task ', kind: 'CLI' });
  ok(v.ok && v.value.text === 'the usage of vibespace-task\nlies about --group' && v.value.about === 'vibespace-task' && v.value.kind === 'cli', `trimmed, CRLF → LF, a control char and a bidi override stripped, kind lower-cased (${JSON.stringify(v.value)})`);
  ok(M.validate({ text: 'x' }).value.kind === 'other' && M.validate({ text: 'x', kind: '' }).value.kind === 'other' && M.validate({ text: 'x' }).value.about === '', 'kind defaults to other, about to empty');
  const code = (b) => M.validate(b).code;
  ok(code({}) === 'text_missing' && code({ text: '   \n\t ' }) === 'text_missing' && code({ text: '\u0001\u0002' }) === 'text_missing', 'no text / blank / only controls ⇒ text_missing');
  ok(code({ text: 42 }) === 'text_not_text' && code({ text: ['a'] }) === 'text_not_text', 'a non-string text ⇒ text_not_text');
  ok(M.validate({ text: '字'.repeat(2000) }).ok && code({ text: '字'.repeat(2001) }) === 'text_too_long', '2000 characters pass (CJK = one each, 6000 bytes), 2001 ⇒ text_too_long');
  ok(/2001 characters — 2000 at most/.test(M.validate({ text: 'a'.repeat(2001) }).error), 'the refusal names the count and the bound', M.validate({ text: 'a'.repeat(2001) }).error);
  ok(M.validate({ text: 'x', about: 'a'.repeat(60) }).ok && code({ text: 'x', about: 'a'.repeat(61) }) === 'about_too_long' && code({ text: 'x', about: 7 }) === 'about_not_text', 'about ≤ 60 characters; 61 ⇒ about_too_long; a number ⇒ about_not_text');
  ok(M.KINDS.every((k) => M.validate({ text: 'x', kind: k }).ok) && code({ text: 'x', kind: 'bug' }) === 'kind_unknown' && /cli \| flow \| ui \| docs \| other/.test(M.validate({ text: 'x', kind: 'bug' }).error), `every kind of ${M.KINDS.join('/')} passes; another ⇒ kind_unknown naming the five`);
  ok(M.validate({ text: 'x', about: 'a\nb\tc' }).value.about === 'a b c', 'about is one line (whitespace runs → one space)');
}

console.log('— ② makeRecord: the route\'s facts');
{
  const r = rec('hello', { about: 'vibespace-msg', id: 'fb-1', at: 5 });
  ok(r.id === 'fb-1' && r.at === 5 && r.lastAt === 5 && r.status === 'open' && r.count === 1 && r.handledAt === null && r.handledBy === null, 'id, at = lastAt, open, count 1');
  ok(r.session.id === 'cid-a' && r.session.name === 'lane a' && r.group.id === 'T-1' && r.group.name === 'VibeSpace 车道' && r.harness === 'claude' && r.instance.version === '2.369.301', 'session / group / harness / instance as the route gave them');
  ok(JSON.stringify(r.reporters) === '["cid-a"]', 'the first reporter is kept');
  const odd = M.makeRecord({ text: 't', about: '', kind: 'ui' }, { session: { id: '', name: 'x\u0007y\n' + 'n'.repeat(300) }, group: { id: '' }, harness: 'Claude Code <b>', instance: {} }, { id: 'fb-2', now: 1 });
  ok(odd.session.id === null && odd.session.name.length === 120 && !/[\u0007\n]/.test(odd.session.name) && odd.group === null && odd.harness === 'other' && odd.instance.name === null, 'cleaned facts: an empty id ⇒ null, a name one line ≤ 120, a group with no id ⇒ null, an odd harness string ⇒ "other"');
}

console.log('— ③ fold: the dedup window');
{
  const a = rec('The usage of  vibespace-task lies', { about: 'vibespace-task', at: 0, id: 'fb-a' });
  let f = M.fold([], a, 0);
  ok(f.list.length === 1 && !f.duplicate && f.dropped.length === 0, 'a first report is added');
  const b = rec('the usage of vibespace-task LIES ', { about: 'Vibespace-Task', at: 2 * H, id: 'fb-b', facts: { ...FACTS, session: { id: 'cid-b', name: 'lane b' } } });
  f = M.fold(f.list, b, 2 * H);
  ok(f.duplicate && f.list.length === 1 && f.record.id === 'fb-a' && f.record.count === 2 && f.record.lastAt === 2 * H && f.record.at === 0, 'the same words (case, spaces) + the same about from ANOTHER session 2 h later ⇒ count 2 on the first record, lastAt moved, at kept');
  ok(JSON.stringify(f.record.reporters) === '["cid-a","cid-b"]' && f.record.session.id === 'cid-a', 'the second reporter is kept beside the first; the record stays the first reporter\'s');
  const c = rec('the usage of vibespace-task lies', { about: 'vibespace-task', at: 2 * H + 24 * H - 1, id: 'fb-c' });
  f = M.fold(f.list, c, c.at);
  ok(f.duplicate && f.record.count === 3, 'the window slides from the LAST report: 24 h − 1 ms after it is still a repeat');
  const d = rec('the usage of vibespace-task lies', { about: 'vibespace-task', at: c.at + 24 * H, id: 'fb-d' });
  f = M.fold(f.list, d, d.at);
  ok(!f.duplicate && f.list.length === 2, '24 h after the last report ⇒ a new record');
  const e = rec('the usage of vibespace-task lies', { about: 'vibespace-msg', at: d.at + 1, id: 'fb-e' });
  ok(!M.fold(f.list, e, e.at).duplicate, 'another about ⇒ a new record');
  const many = Array.from({ length: 60 }, (_, i) => rec('same', { at: i, id: 'fb-m' + i, facts: { ...FACTS, session: { id: 's' + i, name: 'n' } } }));
  let L = [];
  for (const r of many) L = M.fold(L, r, r.at).list;
  ok(L.length === 1 && L[0].count === 60 && L[0].reporters.length === M.LIMITS.reporters && L[0].reporters[L[0].reporters.length - 1] === 's59', `60 sessions say the same: one record ×60, its reporters capped at ${M.LIMITS.reporters} (the newest kept)`);
  // CONTROL: the judge sees a different text as new
  ok(!M.fold([a], rec('the usage of vibespace-job lies', { about: 'vibespace-task', at: 1 }), 1).duplicate, 'CONTROL: other words under the same about ⇒ a new record');
}

console.log('— ④ fold: the ring');
{
  let L = [];
  for (let i = 0; i < M.LIMITS.ring; i++) L.push({ ...rec('r' + i, { at: i, id: 'fb-r' + i }), status: i % 2 ? 'handled' : 'open' });
  L[0] = { ...L[0], lastAt: 10_000 };   // the oldest by `at` was reported again since: the least recent is now r1 (handled)
  const f = M.fold(L, rec('one more', { at: 20_000, id: 'fb-new' }), 20_000);
  ok(f.list.length === M.LIMITS.ring && JSON.stringify(f.dropped) === '["fb-r1"]' && !f.list.some((r) => r.id === 'fb-r1') && f.list.some((r) => r.id === 'fb-r0'), `the 501st report drops the LEAST RECENTLY reported record — a handled one here (r1), never the re-reported r0 (${JSON.stringify(f.dropped)})`);
  const g = M.fold(f.list, rec('again', { at: 20_001, id: 'fb-new2' }), 20_001);
  ok(JSON.stringify(g.dropped) === '["fb-r2"]' && g.list.find((r) => r.id === 'fb-r2') === undefined, 'next: r2 — an OPEN record is dropped the same way (the ring is by recency, not status)');
  const dup = M.fold(g.list, rec('one more', { at: 20_002, id: 'fb-dup' }), 20_002);
  ok(dup.duplicate && dup.dropped.length === 0 && dup.list.length === M.LIMITS.ring, 'a repeat at the bound drops nothing');
}

console.log('— ⑤ status, the public row, mine, order, pacing');
{
  const r = rec('x', { id: 'fb-s', at: 1 });
  const h = M.setStatus(r, 'handled', { by: 'owner', now: 9 });
  ok(h.ok && h.record.status === 'handled' && h.record.handledAt === 9 && h.record.handledBy === 'owner', 'handled stamps when and by whom');
  const o = M.setStatus(h.record, 'open', { now: 10 });
  ok(o.ok && o.record.status === 'open' && o.record.handledAt === null && o.record.handledBy === null, 'reopen clears them');
  // lane feedback-handled-verb: the maintainer's vibespace-api feedback.handled stamps the release + a note through THIS call
  const hv = M.setStatus(r, 'handled', { by: 'VibeSpace 主开发', now: 11, version: ' 2.369.330 ', note: 'the composer rides\nabove the keyboard' });
  ok(hv.ok && hv.record.handledVersion === '2.369.330' && hv.record.handledNote === 'the composer rides above the keyboard' && hv.record.handledBy === 'VibeSpace 主开发' && hv.record.handledAt === 11, 'handled with a release and a note: the release trimmed, the note one line, by the conversation\'s name', hv);
  const pr = M.publicRow(hv.record);
  ok(pr.handledVersion === '2.369.330' && pr.handledNote === 'the composer rides above the keyboard', 'publicRow carries them (the owner\'s sheet draws «handled in 2.369.330 by …» and the note)');
  const ov = M.setStatus(hv.record, 'open', { now: 12 });
  ok(ov.ok && ov.record.handledVersion === null && ov.record.handledNote === null, 'a reopen clears the release and the note too');
  ok(M.setStatus(r, 'handled', { now: 1, version: '2.369' }).code === 'version_bad' && M.setStatus(r, 'handled', { now: 1, version: 'v2.369.330' }).code === 'version_bad' && M.setStatus(r, 'handled', { now: 1, note: 'x'.repeat(201) }).code === 'note_too_long' && M.setStatus(r, 'handled', { now: 1, note: '字'.repeat(200) }).ok,
    'a malformed release or a 201-character note: refused by name (200 CJK characters fit — characters, not bytes)');
  const fresh = rec('y');
  ok(M.setStatus(r, 'handled', { now: 1 }).record.handledVersion === null && M.setStatus(r, 'handled', { now: 1 }).record.handledNote === null && 'handledVersion' in fresh && fresh.handledVersion === null && fresh.handledNote === null, 'the owner\'s click names none (null); a new record carries both fields, null');
  ok(M.setStatus(r, 'done', { now: 1 }).code === 'status_unknown', 'another status ⇒ status_unknown');
  const p = M.publicRow({ ...r, reporters: ['cid-a', 'cid-b'], harness: 'codex' });
  ok(!('reporters' in p) && p.harness === 'codex' && p.text === 'x' && p.count === 1 && p.status === 'open' && p.group.name === 'VibeSpace 车道', 'publicRow: no reporter list; the harness by name; the rest as stored');
  ok(M.publicRow({ ...r, harness: '/usr/bin/claude --dangerously' }).harness === 'other' && M.publicRow(null) === null, 'publicRow: a raw harness string never reaches a reader ("other")');
  ok(M.isMine({ ...r, reporters: ['cid-a', 'cid-z'] }, ['cid-z']) && M.isMine(r, [null, 'cid-a']) && !M.isMine(r, ['cid-b']) && !M.isMine(r, []), 'isMine: the first reporter or a repeater; nobody else');
  const rows = [{ id: 'a', at: 1, lastAt: 5 }, { id: 'b', at: 3, lastAt: 3 }, { id: 'c', at: 4, lastAt: 9 }];
  ok(rows.sort(M.byNewest).map((x) => x.id).join('') === 'cab' && M.openCount([{ status: 'open' }, { status: 'handled' }, {}]) === 2, 'newest REPORT first (a repeat counts as new); openCount counts open');
  ok(M.paceVerdict(0, 5) === null && M.paceVerdict(1000, 11_000) === null, 'pacing: a first report, and one 10 s after the last, go');
  const pv = M.paceVerdict(1000, 4000);
  ok(pv && pv.code === 'paced' && pv.retryAfterS === 7 && /wait 7 s/.test(pv.error), `3 s after the last ⇒ paced, wait 7 s (${pv && pv.error})`);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
