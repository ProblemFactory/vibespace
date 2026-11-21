#!/usr/bin/env node
// THE HUB'S RING OF A CLAUDE CHAT NEVER CUTS A HELD MESSAGE WHILE IT IS OWED (B-5a4d remainder, lane bl-keys-misc — the
// coordinator's law 2026-11-21: «A RECORD THAT CHANGES WHAT A CONVERSATION IS (a held copy, its queue record) IS NEVER TRIMMED
// WHILE IT IS STILL OWED»). The hub keeps a claude chat's lines in memory (`session.buffer`, seeded at a restore from the
// wrapper's file — the only place a HELD message's copy lives); four writers cut it with `.slice(-500000)` until this unit, so
// a long turn's output pushed the copy, its `queued_input` and the queue's `queue_changed` out, and a page that attached drew
// no bubble and no strip row for a message still waiting. THE ONE TRIM is src/chat-ring.js trimRing.
//   ① A HELD MESSAGE THROUGH A LONG TURN: 900 000 chars of the turn's lines after the hold, chunk by chunk through the stream
//      parser's expression — the page's history (session-store's merge + the normalizer, as an attach rebuilds it) still draws
//      its bubble with its words and its strip row; the ring stays within its bound, cut at a line. RED: the release's trim
//      (its expression) and a copy of src/chat-ring.js without the carry draw neither
//   ② NOT OWED, NOT CARRIED: a held message that ran (the queue empty), one removed, a handed one that landed — none of their
//      lines is carried (a copy carried past its witness would draw twice); a handed one is carried until it lands
//   ③ THE BOUND: owed records past CARRY_MAX — the newest kept, the count of the others answered
//   ④ THE ONE TRIM — every writer of a claude chat's ring calls trimRing, none slices it; RED: the release's line in a copy
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + detail}`); } }
const WD = armWatchdog({ capMs: 30e3 });
const CR = require(path.join(ROOT, 'src/chat-ring.js'));
const CR_SRC = fs.readFileSync(path.join(ROOT, 'src/chat-ring.js'), 'utf8');
const { SessionMessages } = require(path.join(ROOT, 'src/session-store.js'));
const { MessageManager } = require(path.join(ROOT, 'src/message-manager.js'));

// ── the lines, as the wrapper and the hub write them ──
const M1 = 'msg-held-1', M2 = 'msg-handed-2', M3 = 'msg-ran-3', M4 = 'msg-removed-4';
const uuidOf = (id) => '00000000-0000-4000-8000-' + Buffer.from(id).toString('hex').padEnd(12, '0').slice(0, 12);
const WORDS = { [M1]: 'please also check the second file', [M2]: 'and the third one', [M3]: 'a message that already ran', [M4]: 'a message the person removed' };
const copy = (id, words = WORDS[id]) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: words }] }, msgId: id, cliUuid: uuidOf(id), handNo: 0, _fromWebui: true, webui_copy: true, timestamp: '2026-11-21T10:00:00.000Z' });
const queued = (id) => JSON.stringify({ type: 'queued_input', msg_id: id, turn_id: null });
const queue = (ids) => JSON.stringify({ type: 'queue_changed', items: ids.map((id, i) => ({ id: 'q' + i, msgId: id, preview: WORDS[id], text: WORDS[id], ts: 1, kind: 'user', from: null })), turn_id: null, verbs: ['remove', 'edit'] });
const handover = (id, state) => JSON.stringify({ type: 'input_handover', state, msg_ids: [id] });
const removed = (id) => JSON.stringify({ type: 'queue_op_result', op: 'remove', id: 'q0', ok: true, msg_id: id });
let k = 0;
const filler = () => JSON.stringify({ type: 'assistant', uuid: '11111111-0000-4000-8000-' + String(k).padStart(12, '0'), message: { id: 'msg_f' + (k++), role: 'assistant', content: [{ type: 'text', text: 'the turn says more '.repeat(48) }] } });
const lines = (chars) => { let s = ''; while (s.length < chars) s += filler() + '\n'; return s; };
/** the stream parser's expression (src/server/stdout/claude-stream-json.js), chunk by chunk */
const streamThrough = (ring, chars, trim, chunk = 65536) => { const all = lines(chars); let max = 0; for (let i = 0; i < all.length; i += chunk) { ring = trim(ring + all.slice(i, i + chunk)); max = Math.max(max, ring.length); } return { ring, last: all.slice(-2000), max }; };
const RELEASE_TRIM = (s) => (s.length > 750000 ? s.slice(-500000) : s);   // the release's four writers (the stream parser's numbers)
/** the page's history after an attach: session-store's merge of the ring (no transcript yet), then the normalizer */
function drawOf(buffer, id = M1) {
  const sm = new SessionMessages({ cwd: '/tmp/chat-ring-suite', backend: 'claude', buffer }, 'chat-ring-suite');
  const mm = new MessageManager('chat-ring-suite');
  mm.convertHistory(sm.raw());
  const bubble = mm.messages.find((m) => m.role === 'user' && m.webuiMsgId === id);
  return { bubble: !!bubble, words: bubble ? JSON.stringify(bubble.content).includes(WORDS[id]) : false, strip: (mm._queue || []).some((it) => it.msgId === id) };
}
const ringAt = (id) => lines(20000) + copy(id) + '\n' + queued(id) + '\n' + queue([id]) + '\n';

say('① A HELD MESSAGE THROUGH A LONG TURN — the page still draws its bubble and its strip row');
WD.section('①');
const M = mutantCopies('chat-ring', ROOT);
const NOCARRY_AT = '  return { buffer: carry + tail, carried: keepIdx.size, dropped: pick.length - keepIdx.size };\n';
const NOCARRY = require(M.write('src/chat-ring.js', anchored(CR_SRC, NOCARRY_AT, '  return { buffer: tail, carried: 0, dropped: pick.length };   // MUTANT: no carry\n', 'no-carry'), 'no-carry'));
{
  const before = drawOf(ringAt(M1));
  ok(before.bubble && before.words && before.strip, 'the control: right after the hold the page draws the held message\'s bubble (its words) and its strip row', JSON.stringify(before));
  const mine = streamThrough(ringAt(M1), 900000, CR.trimRing);
  const d = drawOf(mine.ring);
  ok(d.bubble && d.words && d.strip, `after 900 000 chars of the turn's lines the page STILL draws the bubble with its words and the strip row (ring ${mine.ring.length} chars)`, JSON.stringify(d));
  const at = [copy(M1), queued(M1), queue([M1])].map((l) => mine.ring.indexOf(l + '\n'));
  ok(at[0] === 0 && at[1] > at[0] && at[2] > at[1], 'the carried lines lead the ring in their order: the copy, its queued_input, the queue', JSON.stringify(at));
  const lead = [copy(M1), queued(M1), queue([M1])].map((l) => l + '\n').join('');
  const fin = CR.trimRingOf(mine.ring + lines(300000));   // one more trim, read AT it
  const tail = fin.buffer.slice(lead.length);
  ok(mine.max <= CR.RING_MAX + 65536 && mine.ring.endsWith(mine.last), `the ring stays within its bound through the turn (at most ${mine.max} chars between two trims) and ends with the turn's last lines`);
  ok(fin.carried === 3 && fin.dropped === 0 && fin.buffer.startsWith(lead) && tail.length <= CR.RING_KEEP && tail.startsWith('{"type":"assistant"'), `AT a trim: the three owed lines carried, then the kept tail (${tail.length} ≤ ${CR.RING_KEEP} chars) cut AT A LINE`, JSON.stringify({ carried: fin.carried, dropped: fin.dropped, tail: tail.length }));
  const rel = drawOf(streamThrough(ringAt(M1), 900000, RELEASE_TRIM).ring);
  ok(!rel.bubble && !rel.strip, 'RED: the release\'s trim (.slice(-500000) past 750 000) — no bubble, no strip row for the held message', JSON.stringify(rel));
  const nc = drawOf(streamThrough(ringAt(M1), 900000, NOCARRY.trimRing).ring);
  ok(!nc.bubble && !nc.strip, 'RED: a copy of src/chat-ring.js without the carry — no bubble, no strip row', JSON.stringify(nc));
  // the appenders' expression (the person's send, a permission answer, an auto-allow mark) is the same call
  const app = CR.trimRing(mine.ring + lines(300000) + JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' }, msgId: 'later', timestamp: '2026-11-21T10:05:00.000Z', _fromWebui: true }) + '\n');
  ok(drawOf(app).bubble, 'an appender\'s trim (the person\'s next send past the bound) carries the held message too');
}

say('② NOT OWED, NOT CARRIED — a message that ran, one removed, one handed until it lands');
WD.section('②');
{
  const ran = streamThrough(ringAt(M3) + queue([]) + '\n', 900000, CR.trimRing).ring;
  ok(!ran.includes(M3), 'a held message that RAN (the queue said it is empty): neither its copy nor its queue records are carried');
  const gone = streamThrough(ringAt(M4) + removed(M4) + '\n' + queue([]) + '\n', 900000, CR.trimRing).ring;
  ok(!gone.includes(M4), 'a held message the person REMOVED: nothing of it carried');
  const handed = lines(20000) + copy(M2) + '\n' + handover(M2, 'handed') + '\n';
  const r1 = streamThrough(handed, 900000, CR.trimRing).ring;
  ok(r1.startsWith(copy(M2) + '\n' + handover(M2, 'handed') + '\n') && drawOf(r1, M2).bubble, 'a HANDED message (written into the running turn, not yet landed): its copy and its hand-over carried, its bubble drawn');
  const r2 = streamThrough(r1 + handover(M2, 'landed') + '\n', 900000, CR.trimRing).ring;
  ok(!r2.includes(M2), 'the same message once it LANDED: nothing carried at the next trim (the transcript holds it now)');
  const later = streamThrough(ringAt(M1) + lines(10000) + queue([M1]) + '\n', 900000, CR.trimRing).ring;
  ok(later.split('"type":"queue_changed"').length === 2, 'a queue said again later: ONE queue record in the ring (the earlier, superseded one is not carried)');
}

say('③ THE BOUND — owed records past CARRY_MAX: the newest kept, the others counted');
WD.section('③');
{
  const ids = Array.from({ length: 40 }, (_, i) => 'msg-many-' + i);
  for (const id of ids) WORDS[id] = 'w'.repeat(8000) + id;
  let ring = '';
  for (const id of ids) ring += copy(id) + '\n';
  ring += queue(ids) + '\n' + lines(800000);
  const r = CR.trimRingOf(ring);
  const carriedChars = r.buffer.length - (ring.length - ring.indexOf('\n', ring.length - CR.RING_KEEP) - 1);
  ok(r.dropped > 0 && r.carried > 0 && carriedChars <= CR.CARRY_MAX && r.buffer.includes(copy(ids[39]) + '\n') && !r.buffer.includes(copy(ids[0]) + '\n') && !r.buffer.includes('"type":"queue_changed"'), `${ids.length} held copies of 8 KB and a queue record of ${queue(ids).length} chars: ${r.carried} carried (${carriedChars} chars ≤ ${CR.CARRY_MAX}), the newest first, the queue record too long to fit left, ${r.dropped} answered as left`);
  const huge = JSON.stringify({ type: 'user', message: { role: 'user', content: 'y'.repeat(300000) }, msgId: ids[0], timestamp: '2026-11-21T10:01:00.000Z', _fromWebui: true });
  const one = CR.trimRingOf(copy(ids[0]) + '\n' + huge + '\n' + queue([ids[0]]) + '\n' + lines(800000));
  ok(one.carried === 2 && one.dropped === 1 && one.buffer.startsWith(copy(ids[0]) + '\n' + queue([ids[0]]) + '\n') && !one.buffer.includes(huge), 'an owed record that does not fit (a 300 000-char send between) is left, and the older copy that fits still goes, before the queue', JSON.stringify({ carried: one.carried, dropped: one.dropped }));
}

say('④ THE ONE TRIM — every writer of a claude chat\'s ring calls trimRing');
WD.section('④');
const SITES = [
  ['src/server/stdout/claude-stream-json.js', '      session.buffer = trimRing(session.buffer + output);\n'],
  ['src/server/user-input.js', "      session.buffer = trimRing(session.buffer + JSON.stringify(userMsg) + '\\n');\n"],
  ['src/server/permission-answer.js', "  session.buffer = trimRing(session.buffer + payload + '\\n');\n"],
  ['src/server/bypass-auto-allow.js', "  session.buffer = trimRing(session.buffer + JSON.stringify(mark) + '\\n');\n"],
];
const RELEASE_LINES = [
  '      session.buffer += output;\n      if (session.buffer.length > 750000) session.buffer = session.buffer.slice(-500000);\n',   // stale-pins: kept (the release's line — the census's RED)
  "      session.buffer = (session.buffer + JSON.stringify(userMsg) + '\\n').slice(-500000);\n",   // stale-pins: kept (the release's line — the census's RED)
  "  session.buffer = (session.buffer + payload + '\\n').slice(-500000);\n",   // stale-pins: kept (the release's line — the census's RED)
  "  session.buffer = (session.buffer + JSON.stringify(mark) + '\\n').slice(-500000);\n",   // stale-pins: kept (the release's line — the census's RED)
];
const census = (text, line) => text.split(line).length === 2 && /require\('(\.\.\/)+chat-ring\.js'\)/.test(text) && !/session\.buffer(\s*\+[^;\n]*\))?\.slice\(/.test(text) && !/session\.buffer = \([^;\n]*\)\.slice\(/.test(text);   // stale-pins: kept (the release's line — the census's RED)
{
  for (const [rel, line] of SITES) ok(census(fs.readFileSync(path.join(ROOT, rel), 'utf8'), line), `${rel}: the ring's one trim, no slice of session.buffer`);
  const [rel, line] = SITES[1];
  const releaseCopy = anchored(fs.readFileSync(path.join(ROOT, rel), 'utf8'), line, RELEASE_LINES[1], 'release-line');
  ok(!census(releaseCopy, line), 'RED: the release\'s line in a copy of src/server/user-input.js is named');
  const streamCopy = anchored(fs.readFileSync(path.join(ROOT, SITES[0][0]), 'utf8'), SITES[0][1], RELEASE_LINES[0], 'release-stream');
  ok(!census(streamCopy, SITES[0][1]), 'RED: the release\'s two lines in a copy of the stream parser are named');
}
for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 1, label: 'B-5a4d ring ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
