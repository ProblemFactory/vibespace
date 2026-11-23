#!/usr/bin/env node
// THE HUB'S RING OF A CLAUDE CHAT NEVER CUTS A HELD MESSAGE WHILE IT IS OWED (B-5a4d remainder, lane bl-keys-misc — the
// coordinator's law 2026-11-21: «A RECORD THAT CHANGES WHAT A CONVERSATION IS (a held copy, its queue record) IS NEVER TRIMMED
// WHILE IT IS STILL OWED»; round wo1y3u2zm, r1488: an owed record is never dropped whatever its size; the next trim is far; the
// fifth writer; the census walks every write). The hub keeps a claude chat's lines in memory (`session.buffer`, seeded at a
// restore from the wrapper's file — the only place a HELD message's copy lives); five writers cut it with `.slice(-500000)`
// until this unit. THE ONE TRIM is src/chat-ring.js trimRing(text, session, id).
//   ① A HELD MESSAGE THROUGH A LONG TURN: 900 000 chars of the turn's lines after the hold, chunk by chunk through the stream
//      parser's expression — the page's history (session-store's merge + the normalizer, as an attach rebuilds it) still draws
//      its bubble and its strip row; a HELD MESSAGE WITH A PICTURE (its send record 260 000 chars, the picture inline) too.
//      RED: the release's trim; a copy of src/chat-ring.js without the carry; a copy that keeps the old 250 000-char carry bound
//   ② THE NEXT TRIM IS FAR: 2 MB of stream with a 260 000-char record held — trims counted, each ≥ 250 000 chars of stream
//      from the last (RED: a copy whose trigger forgets what it carried trims at nearly every chunk)
//   ③ NOT OWED, NOT CARRIED: a held message that ran (the queue says it is empty — a removal reads the same way: the next
//      queue_changed), a handed one once it landed; one queue record kept of two
//   ④ THE LAST GUARD (OWED_MAX) — past it the oldest owed records go, and the journal SAYS them by msgId and count; a queue of
//      VibeSpace's own frames (no msgId) keeps its strip row
//   ⑤ A LIVE TRANSCRIPT (tool results after the held send): what a person sees — the held message in the strip with its words,
//      and no chat bubble from the hub's own send record (the merge's rule for a record the transcript has passed), the SAME as
//      the untrimmed ring draws; after a restart (the wrapper's copy) the bubble too
//   ⑥ THE CENSUS — every write of a session's ring in the tree (every spelling of the field), each a row: a claude ring's
//      write goes through trimRing with its session; RED: the release's fifth writer in a copy; a new write site planted
import fs from 'node:fs';
import os from 'node:os';
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
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 500)}`); } }
const WD = armWatchdog({ capMs: 30e3 });
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-chat-ring-'));
process.env.HOME = HOME;   // ⑤'s transcript lives here — never the machine's own home
process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { } });
const CR = require(path.join(ROOT, 'src/chat-ring.js'));
const CR_SRC = fs.readFileSync(path.join(ROOT, 'src/chat-ring.js'), 'utf8');
const SS = require(path.join(ROOT, 'src/session-store.js'));
const { MessageManager } = require(path.join(ROOT, 'src/message-manager.js'));

// ── the lines, as the wrapper and the hub write them ──
const M1 = 'msg-held-1', M2 = 'msg-handed-2', M3 = 'msg-ran-3', MP = 'msg-picture-5';
const uuidOf = (id) => '00000000-0000-4000-8000-' + Buffer.from(id).toString('hex').padEnd(12, '0').slice(0, 12);
const WORDS = { [M1]: 'please also check the second file', [M2]: 'and the third one', [M3]: 'a message that already ran', [MP]: 'what is wrong in this screenshot' };
const T_SEND = '2026-11-21T10:00:00.000Z';
const copy = (id, words = WORDS[id]) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: words }] }, msgId: id, cliUuid: uuidOf(id), handNo: 0, _fromWebui: true, webui_copy: true, timestamp: T_SEND });
const PIC = 'iVBORw0KGgo' + 'A'.repeat(260000);   // two screenshots' base64, inline in the hub's own send record (the client's whole frame)
const sendRec = (id, pic = null) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: WORDS[id] }, ...(pic ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: pic } }] : [])] }, msgId: id, timestamp: T_SEND, _fromWebui: true });
const queued = (id) => JSON.stringify({ type: 'queued_input', msg_id: id, turn_id: null });
// the wrapper's publishQueue: a text past QUEUE_EDIT_MAX_CHARS rides no edit; a frame VibeSpace typed has no msgId (kind 'system')
const queue = (ids, sys = 0) => JSON.stringify({ type: 'queue_changed', items: [...ids.map((id, i) => ({ id: 'q' + i, msgId: id, preview: String(WORDS[id] || '').slice(0, 40), ...(String(WORDS[id] || '').length <= 20000 ? { text: WORDS[id] } : {}), ts: 1, kind: 'user', from: null })), ...Array.from({ length: sys }, (_, i) => ({ id: 's' + i, msgId: '', preview: 'continue', ts: 1, kind: 'system', from: null, steerable: false }))], turn_id: null, verbs: ['remove', 'edit'] });
const handover = (id, state) => JSON.stringify({ type: 'input_handover', state, msg_ids: [id] });
let k = 0;
const filler = () => JSON.stringify({ type: 'assistant', uuid: '11111111-0000-4000-8000-' + String(k).padStart(12, '0'), message: { id: 'msg_f' + (k++), role: 'assistant', content: [{ type: 'text', text: 'the turn says more '.repeat(48) }] } });
const lines = (chars) => { let s = ''; while (s.length < chars) s += filler() + '\n'; return s; };
/** the stream parser's expression (src/server/stdout/claude-stream-json.js), chunk by chunk — `trims` counts the cuts */
const streamThrough = (ring, chars, trim, chunk = 65536) => { const all = lines(chars); let max = 0, trims = 0, at = [], fed = 0; for (let i = 0; i < all.length; i += chunk) { const piece = all.slice(i, i + chunk); fed += piece.length; const before = ring.length + piece.length; ring = trim(ring + piece); if (ring.length < before) { trims++; at.push(fed); } max = Math.max(max, ring.length); } return { ring, last: all.slice(-2000), max, trims, at }; };
const RELEASE_TRIM = (s) => (s.length > 750000 ? s.slice(-500000) : s);
/** ONE session a stream (line 500's follow): the trim remembers what it carried BY session, as every writer hands its own */
const trimOne = (mod, ...a) => { const sess = {}; return (s) => mod.trimRing(s, sess, ...a); };   // the release's writers (the stream parser's numbers)
/** the page's history after an attach: session-store's merge of the ring (with the transcript when one is named), then the normalizer */
function drawOf(buffer, id = M1, { sid = null, cwd = '/tmp/chat-ring-suite' } = {}) {
  const sm = new SS.SessionMessages({ cwd, backend: 'claude', buffer, ...(sid ? { backendSessionId: sid, claudeSessionId: sid } : {}) }, 'chat-ring-suite');
  const mm = new MessageManager('chat-ring-suite');
  mm.convertHistory(sm.raw());
  const bubble = mm.messages.find((m) => m.role === 'user' && m.webuiMsgId === id);
  const item = (mm._queue || []).find((it) => it.msgId === id);
  return { bubble: !!bubble, words: bubble ? JSON.stringify(bubble.content).includes(WORDS[id]) : false, picture: bubble ? JSON.stringify(bubble.content).includes('"image"') : false, strip: !!item, stripWords: !!(item && item.text === WORDS[id]) };
}
const ringAt = (id, rec = copy(id)) => lines(20000) + rec + '\n' + queued(id) + '\n' + queue([id]) + '\n';
const M = mutantCopies('chat-ring', ROOT);

say('① A HELD MESSAGE THROUGH A LONG TURN — the page still draws its bubble and its strip row; one with a PICTURE too');
WD.section('①');
const NOCARRY = require(M.write('src/chat-ring.js', anchored(CR_SRC, "  return { buffer: carry + tail, cut: true, carried: keepIdx.size, carriedChars: carry.length, dropped: pick.length - keepIdx.size, droppedIds: [...new Set(droppedIds)], droppedKinds };\n",
  "  return { buffer: tail, cut: true, carried: 0, carriedChars: 0, dropped: pick.length, droppedIds: [] };   // MUTANT: no carry\n", 'no-carry'), 'no-carry'));
const OLDBOUND = require(M.write('src/chat-ring.js', anchored(CR_SRC, "const OWED_MAX = 32 * 1024 * 1024;", "const OWED_MAX = 250000;   // MUTANT: 8b6ea0756's carry bound", 'old-bound'), 'old-bound'));
{
  const before = drawOf(ringAt(M1));
  ok(before.bubble && before.words && before.strip, 'the control: right after the hold the page draws the held message\'s bubble (its words) and its strip row', before);
  const sess = {};
  const mine = streamThrough(ringAt(M1), 900000, (s) => CR.trimRing(s, sess, 'chat-ring-suite'));
  const d = drawOf(mine.ring);
  ok(d.bubble && d.words && d.strip, `after 900 000 chars of the turn's lines the page STILL draws the bubble with its words and the strip row (ring ${mine.ring.length} chars)`, d);
  const lead = [copy(M1), queued(M1), queue([M1])].map((l) => l + '\n').join('');
  const fin = CR.trimRingOf(mine.ring + lines(800000), {});
  const tail = fin.buffer.slice(lead.length);
  ok(mine.ring.endsWith(mine.last) && fin.carried === 3 && fin.dropped === 0 && fin.buffer.startsWith(lead) && tail.length <= CR.RING_KEEP && tail.startsWith('{"type":"assistant"'), `AT a trim: the three owed lines carried in their order, then the kept tail (${tail.length} ≤ ${CR.RING_KEEP} chars) cut AT A LINE`, { carried: fin.carried, tail: tail.length });
  const rel = drawOf(streamThrough(ringAt(M1), 900000, RELEASE_TRIM).ring);
  ok(!rel.bubble && !rel.strip, 'RED: the release\'s trim (.slice(-500000) past 750 000) — no bubble, no strip row for the held message', rel);
  const nc = drawOf(streamThrough(ringAt(M1), 900000, trimOne(NOCARRY)).ring);
  ok(!nc.bubble && !nc.strip, 'RED: a copy of src/chat-ring.js without the carry — no bubble, no strip row', nc);
  // r1488 (1): THE COMMONEST HELD MESSAGE — a screenshot, inline in the hub's own send record (no transcript yet: it draws)
  const ringP = ringAt(MP, sendRec(MP, PIC));
  const p0 = drawOf(ringP, MP);
  const pic = streamThrough(ringP, 900000, trimOne(CR, 'chat-ring-suite'));
  const dp = drawOf(pic.ring, MP);
  ok(p0.bubble && p0.picture && dp.bubble && dp.words && dp.picture && dp.strip, `a held message WITH A PICTURE (its send record ${sendRec(MP, PIC).length} chars): after 900 000 chars of the turn its bubble still draws, words and picture, and its strip row`, dp);
  const warned = []; const warnWas = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  const ob = drawOf(streamThrough(ringP, 900000, trimOne(OLDBOUND, 'chat-ring-suite')).ring, MP);
  console.warn = warnWas;
  ok(!ob.bubble && ob.strip && warned.some((w) => w.includes(MP) && w.includes('1 owed record')), 'RED: a copy with 8b6ea0756\'s 250 000-char bound — the picture\'s bubble is GONE (the strip row stays); this tree\'s guard at least SAYS it in the journal by msgId and count', { ob, warned: warned.slice(0, 2) });
  const app = CR.trimRing(mine.ring + lines(300000) + JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' }, msgId: 'later', timestamp: '2026-11-21T10:05:00.000Z', _fromWebui: true }) + '\n', sess, 'chat-ring-suite');
  ok(drawOf(app).bubble, 'an appender\'s trim (the person\'s next send past the bound) carries the held message too');
}

say('② THE NEXT TRIM IS FAR — 2 MB of stream with a 260 000-char record held: the trims counted');
WD.section('②');
const FORGETS = require(M.write('src/chat-ring.js', anchored(CR_SRC, "  if (s.length <= max + Math.max(0, owedChars)) return", "  if (s.length <= max) return", 'forgets'), 'forgets'));   // MUTANT: the trigger forgets what it carried
{
  const ringP = ringAt(MP, sendRec(MP, PIC));
  const sessP = {}, sessR = {};   // ONE session a stream, as every writer hands its own (the trim remembers what it carried BY session)
  const mine = streamThrough(ringP, 2000000, (s) => CR.trimRing(s, sessP, 'chat-ring-suite'));
  const gaps = mine.at.slice(1).map((x, i) => x - mine.at[i]);
  ok(mine.trims >= 2 && mine.trims <= Math.ceil(2000000 / (CR.RING_MAX - CR.RING_KEEP)) + 1 && gaps.every((g) => g >= CR.RING_MAX - CR.RING_KEEP - 65536) && drawOf(mine.ring, MP).picture,
    `${mine.trims} trims over 2 000 000 chars of stream (chunks of 64 KB), every one ${Math.min(...gaps)}+ chars of stream after the last (≥ 100 000 by law; the ceiling less the kept tail, less one chunk) — the held picture still drawn`, { trims: mine.trims, gaps });
  const red = streamThrough(ringP, 2000000, (s) => FORGETS.trimRing(s, sessR, 'chat-ring-suite'));
  ok(red.trims >= 20, `RED: a copy whose trigger forgets what it carried — ${red.trims} trims (nearly every chunk: each one flattens, scans and parses ~750 KB again)`, { trims: red.trims });
}

say('③ NOT OWED, NOT CARRIED — a message that ran (or was removed: the next queue says so), a handed one once it landed');
WD.section('③');
{
  const ran = streamThrough(ringAt(M3) + queue([]) + '\n', 900000, trimOne(CR)).ring;
  ok(!ran.includes(M3), 'a held message that RAN — or was REMOVED: either way the next queue_changed lists it no more (the same rule) — neither its copy nor its queue records are carried');
  const handed = lines(20000) + copy(M2) + '\n' + handover(M2, 'handed') + '\n';
  const sess = {};
  const r1 = streamThrough(handed, 900000, (s) => CR.trimRing(s, sess)).ring;
  ok(r1.startsWith(copy(M2) + '\n' + handover(M2, 'handed') + '\n') && drawOf(r1, M2).bubble, 'a HANDED message (written into the running turn, not yet landed): its copy and its hand-over carried, its bubble drawn');
  const r2 = streamThrough(r1 + handover(M2, 'landed') + '\n', 900000, (s) => CR.trimRing(s, sess)).ring;
  ok(!r2.includes(M2), 'the same message once it LANDED: nothing carried at the next trim (the transcript holds it now)');
  const later = streamThrough(ringAt(M1) + lines(10000) + queue([M1]) + '\n', 900000, trimOne(CR)).ring;
  ok(later.split('"type":"queue_changed"').length === 2, 'a queue said again later: ONE queue record in the ring (the earlier, superseded one is not carried)');
}

say('④ THE LAST GUARD — past OWED_MAX the oldest owed records go, SAID by msgId and count; a queue of VibeSpace\'s own frames');
WD.section('④');
{
  const ids = Array.from({ length: 6 }, (_, i) => 'msg-many-' + i);
  for (const id of ids) WORDS[id] = 'w'.repeat(40000) + id;
  let ring = '';
  for (const id of ids) ring += copy(id) + '\n';
  ring += queue(ids) + '\n' + lines(800000);
  const warned = []; const warnWas = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  const out = CR.trimRing(ring, {}, 'conv-guard', { owedMax: 130000 });
  console.warn = warnWas;
  const r = CR.trimRingOf(ring, { owedMax: 130000 });
  ok(r.dropped > 0 && out.includes(copy(ids[5]) + '\n') && !out.includes(copy(ids[0]) + '\n') && warned.length === 1 && warned[0].includes('conv-guard') && warned[0].includes(`${r.dropped} owed record`) && r.droppedIds.every((id) => warned[0].includes(id)),
    `past a guard of 130 000 chars: the newest owed kept, ${r.dropped} oldest left — and the journal says so ONCE, by conversation, count and msgIds («${(warned[0] || '').slice(0, 120)}…»)`, { dropped: r.dropped, warned });
  const kw = []; const kwWas = console.warn; console.warn = (...a) => kw.push(a.join(' '));
  const kinds = CR.trimRingOf(handover('msg-kind', 'handed') + '\n' + copy('msg-kind', 'k') + '\n' + lines(800000), { owedMax: 10 });
  CR.trimRing(handover('msg-kind', 'handed') + '\n' + copy('msg-kind', 'k') + '\n' + lines(800000), {}, 'conv-kinds', { owedMax: 10 });
  console.warn = kwWas;
  ok(kinds.dropped === 2 && kinds.droppedKinds.message === 1 && kinds.droppedKinds.handover === 1 && kw.length === 1 && kw[0].includes('2 owed record') && kw[0].includes('msg-kind') && kw[0].includes('1 hand-over record'),
    `the last guard SAYS WHAT IT LISTS: a held message by its msgId, a hand-over record by its kind (no id of its own) — «${(kw[0] || '').slice(0, 140)}»`, { kinds: kinds.droppedKinds, kw });
  const sys = CR.trimRingOf(lines(20000) + queue([], 2) + '\n' + lines(800000), {});
  ok(sys.buffer.startsWith(queue([], 2) + '\n'), 'a queue holding only frames VibeSpace typed (no msgId) keeps its strip row through a trim');
  ok(CR.OWED_MAX === 32 * 1024 * 1024 && CR.RING_MAX - CR.RING_KEEP === 250000, 'THE NUMBERS: the ring is bounded by RING_MAX (750 000) + what is owed, and what is owed by OWED_MAX (32 MiB — the queue caps no count, a frame only the socket\'s 100 MiB); the next trim ≥ 250 000 chars of stream away');
}

say('⑤ A LIVE TRANSCRIPT — tool results after the held send: what a person sees');
WD.section('⑤');
{
  const SID = '22222222-0000-4000-8000-000000000001', CWD = '/tmp/chat-ring-suite-live';
  const dir = path.join(HOME, '.claude', 'projects', SS.cwdToProjectDir(CWD)); fs.mkdirSync(dir, { recursive: true });
  const rec = (o) => JSON.stringify({ sessionId: SID, cwd: CWD, ...o });
  fs.writeFileSync(path.join(dir, SID + '.jsonl'), [
    rec({ type: 'user', uuid: '33333333-0000-4000-8000-000000000001', timestamp: '2026-11-21T09:59:00.000Z', message: { role: 'user', content: 'start the long task' } }),
    rec({ type: 'assistant', uuid: '33333333-0000-4000-8000-000000000002', timestamp: '2026-11-21T09:59:10.000Z', message: { id: 'msg_live1', role: 'assistant', content: [{ type: 'tool_use', id: 'tu_live1', name: 'Bash', input: { command: 'ls' } }] } }),
    rec({ type: 'user', uuid: '33333333-0000-4000-8000-000000000003', timestamp: '2026-11-21T10:01:00.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_live1', content: 'ok' }] } }),
  ].join('\n') + '\n');
  const live = ringAt(M1, sendRec(M1));   // a live hub (no restart): the hub's own send record, not the wrapper's copy
  const untrimmed = drawOf(live, M1, { sid: SID, cwd: CWD });
  const trimmed = drawOf(streamThrough(live, 900000, trimOne(CR)).ring, M1, { sid: SID, cwd: CWD });
  ok(!untrimmed.bubble && untrimmed.strip && untrimmed.stripWords && JSON.stringify(trimmed) === JSON.stringify(untrimmed),
    'WHAT A PERSON SEES (a live hub, tool results written after the held send): the held message in the queue strip with its words, no chat bubble from the hub\'s own send record (the merge drops a send record the transcript has passed) — the trimmed ring draws EXACTLY what the untrimmed one does', { untrimmed, trimmed });
  const restored = drawOf(streamThrough(ringAt(M1), 900000, trimOne(CR)).ring, M1, { sid: SID, cwd: CWD });
  ok(restored.bubble && restored.words && restored.strip, 'after a RESTART (the ring seeded with the wrapper\'s copy): the bubble too — a copy is never dropped for a later user record — through the same long turn', restored);
}

say('⑦ A HAND-OVER NEVER SETTLED (a wrapper that died mid-turn) — the carried copy past the CLI\'s own record draws ONE bubble');
WD.section('⑦');
{
  // the scene (src/chat-ring.js header): the wrapper handed M2's frame to the CLI, the CLI recorded it, the wrapper died before any
  // settle — the ring (a restore seeds it from that wrapper's file) keeps the copy and its 'handed' record OWED, and a long turn's
  // trim carries them to the head of a tail whose first transcript match is AFTER the CLI's record of the frame
  const SID = '22222222-0000-4000-8000-000000000007', CWD = '/tmp/chat-ring-suite-handed';
  const dir = path.join(HOME, '.claude', 'projects', SS.cwdToProjectDir(CWD)); fs.mkdirSync(dir, { recursive: true });
  const rec = (o) => JSON.stringify({ sessionId: SID, cwd: CWD, ...o });
  const stream = lines(900000).split('\n').filter(Boolean);   // the turn's lines, on stdout AND in the transcript
  fs.writeFileSync(path.join(dir, SID + '.jsonl'), [
    rec({ type: 'user', uuid: '33333333-0000-4000-8000-000000000071', timestamp: '2026-11-21T09:59:00.000Z', message: { role: 'user', content: 'start the long task' } }),
    rec(JSON.parse(stream[0])),
    rec({ type: 'user', uuid: uuidOf(M2), timestamp: '2026-11-21T10:00:05.000Z', message: { role: 'user', content: [{ type: 'text', text: WORDS[M2] }] } }),   // the CLI's own record of the handed frame
    ...stream.slice(1).map((l) => rec(JSON.parse(l))),
  ].join('\n') + '\n');
  const seeded = stream[0] + '\n' + copy(M2) + '\n' + handover(M2, 'handed') + '\n';   // the dead wrapper's file: no settle, no emptied queue
  const feed = (rest) => { let ring = seeded; const sess = {}; for (let i = 0; i < rest.length; i += 65536) ring = CR.trimRing(ring + rest.slice(i, i + 65536), sess, 'chat-ring-suite'); return ring; };
  const trimmed = feed(stream.slice(1).join('\n') + '\n');
  const untrimmed = seeded + stream.slice(1).join('\n') + '\n';
  const bubblesOf = (buffer, MMClass) => {
    const sm = new SS.SessionMessages({ cwd: CWD, backend: 'claude', buffer, backendSessionId: SID, claudeSessionId: SID }, 'chat-ring-suite');
    const mm = new MMClass('chat-ring-suite'); mm.convertHistory(sm.raw());
    return mm.messages.filter((m) => m.role === 'user' && JSON.stringify(m.content).includes(WORDS[M2])).length;
  };
  const MM_SRC = fs.readFileSync(path.join(ROOT, 'src/message-manager.js'), 'utf8');
  const NOLATE = require(M.write('src/message-manager.js', anchored(MM_SRC, "      if (raw.webui_copy && raw._fromWebui && raw.msgId && typeof raw.cliUuid === 'string' && raw.cliUuid && this._cliUserUuids && this._cliUserUuids.has(raw.cliUuid)) { this.userMessageIds.set(String(raw.msgId), this._cliUserUuids.get(raw.cliUuid)); return; }\n", '', 'no-late-claim'), 'no-late-claim')).MessageManager;
  const carriedFirst = trimmed.startsWith(copy(M2) + '\n');
  const u = bubblesOf(untrimmed, MessageManager), t = bubblesOf(trimmed, MessageManager), tRel = bubblesOf(trimmed, NOLATE), uRel = bubblesOf(untrimmed, NOLATE);
  ok(carriedFirst && u === 1 && t === 1 && uRel === 1 && tRel === 2,
    `a copy whose hand-over never settled, CARRIED past the CLI's own record of the frame by a trim: ONE bubble (untrimmed ${u}, trimmed ${t}) — RED: a normalizer whose claim runs only when the copy comes first draws ${tRel} after the trim (${uRel} untrimmed)`, { carriedFirst, u, t, uRel, tRel });
  // r2794 (2): the copy is carried for the life of the conversation object — 300 of the person's own records between the CLI's record
  // of the frame and the carried copy never let the second bubble back (the map of drawn stamps has no cap)
  const SID2 = '22222222-0000-4000-8000-000000000072', CWD2 = '/tmp/chat-ring-suite-handed-many';
  const dir2 = path.join(HOME, '.claude', 'projects', SS.cwdToProjectDir(CWD2)); fs.mkdirSync(dir2, { recursive: true });
  const rec2 = (o) => JSON.stringify({ sessionId: SID2, cwd: CWD2, ...o });
  const many = Array.from({ length: 300 }, (_, i) => rec2({ type: 'user', uuid: '44444444-0000-4000-8000-' + String(i).padStart(12, '0'), timestamp: '2026-11-21T10:01:00.000Z', message: { role: 'user', content: 'the person\'s next prompt ' + i } }));
  fs.writeFileSync(path.join(dir2, SID2 + '.jsonl'), [
    rec2({ type: 'user', uuid: '33333333-0000-4000-8000-000000000072', timestamp: '2026-11-21T09:59:00.000Z', message: { role: 'user', content: 'start the long task' } }),
    rec2(JSON.parse(stream[0])),
    rec2({ type: 'user', uuid: uuidOf(M2), timestamp: '2026-11-21T10:00:05.000Z', message: { role: 'user', content: [{ type: 'text', text: WORDS[M2] }] } }),
    ...many,
    ...stream.slice(1).map((l) => rec2(JSON.parse(l))),
  ].join('\n') + '\n');
  const bubblesOf2 = (buffer, MMClass) => {
    const sm = new SS.SessionMessages({ cwd: CWD2, backend: 'claude', buffer, backendSessionId: SID2, claudeSessionId: SID2 }, 'chat-ring-suite');
    const mm = new MMClass('chat-ring-suite'); mm.convertHistory(sm.raw());
    return mm.messages.filter((m) => m.role === 'user' && JSON.stringify(m.content).includes(WORDS[M2])).length;
  };
  const CAPPED = require(M.write('src/message-manager.js', anchored(MM_SRC, "        for (const u of [raw.uuid, ...(Array.isArray(raw.mergedSendUuids) ? raw.mergedSendUuids : [])]) if (typeof u === 'string' && u) drawn.set(u, msg.id);\n",
    "        for (const u of [raw.uuid, ...(Array.isArray(raw.mergedSendUuids) ? raw.mergedSendUuids : [])]) if (typeof u === 'string' && u) drawn.set(u, msg.id);\n        while (drawn.size > 256) drawn.delete(drawn.keys().next().value);   // MUTANT: the first form's cap\n", 'capped-256'), 'capped-256')).MessageManager;
  const m2 = bubblesOf2(trimmed, MessageManager), m2Rel = bubblesOf2(trimmed, CAPPED);
  ok(m2 === 1 && m2Rel === 2, `…and after 300 of the person's own records between the CLI's record and the carried copy: still ONE bubble (${m2}) — RED: the first form's 256-stamp cap lets the second bubble back (${m2Rel})`, { m2, m2Rel });
}

say('⑥ THE CENSUS — every write of a session\'s ring in the tree, each a row; a claude ring\'s goes through the one trim');
WD.section('⑥');
// [file, a needle its write lines hold, count, kind, why] — kind 'ring' = a claude chat's ring: trimRing(…, <session> …) required
const WRITES = [
  ['server.js', 's.buffer = require(\'./src/chat-ring.js\').trimRing(s.buffer + JSON.stringify(userMsg) + \'\\n\', s, id);', 1, 'ring', 'the automatic resume\'s send (the fifth writer, r1488 (3))'],
  ['src/server/stdout/claude-stream-json.js', 'session.buffer = trimRing(session.buffer + output, session, id);', 1, 'ring', 'the stream parser'],
  ['src/server/user-input.js', 'session.buffer = trimRing(session.buffer + JSON.stringify(userMsg) + \'\\n\', session, sessionId);', 1, 'ring', 'the person\'s send record'],
  ['src/server/permission-answer.js', 'session.buffer = trimRing(session.buffer + payload + \'\\n\', session);', 1, 'ring', 'a permission answer'],
  ['src/server/bypass-auto-allow.js', 'session.buffer = trimRing(session.buffer + JSON.stringify(mark) + \'\\n\', session, id);', 1, 'ring', 'an auto-allow mark'],
  ['src/server/session-stdout.js', 'session.buffer += output;', 2, 'other', 'a chat backend with no stream protocol (raw passthrough) and a terminal: their own rings'],
  ['src/server/session-stdout.js', 'session.buffer = session.buffer.slice(-800000)', 1, 'other', 'the raw passthrough\'s own bound'],
  ['src/server/session-stdout.js', 'session.buffer = session.buffer.slice(0, session.buffer.length - catchUp.drop.length)', 2, 'other', 'a re-attach catch-up removes the read\'s partial last line from the END (no trim, no bound — lane bl-loop-a, B-cd4b)'],
  ['src/server/session-stdout.js', 'session.buffer = session.buffer.slice(0, session.buffer.length - gap.drop.length)', 1, 'other', 'the restore\'s fence: the partial last line the catch-up fed is removed from the END before the lost lines go through the parser (no trim, no bound — lane bl-loop-a, B-cd4b r1266, on the root 7b23daa71)'],
  ['src/server/session-stdout.js', 'session.buffer += catchUp.text;', 1, 'other', 'a terminal\'s catch-up'],
  ['src/server/session-stdout.js', 'session.buffer = session.buffer.slice(-50000)', 2, 'other', 'a terminal\'s ring (75 000 → 50 000)'],
  ['src/server/session-stdout.js', 'session.buffer = tail.toString(\'utf-8\').slice(-50000);', 1, 'other', 'a terminal\'s repaint from its buffer file'],
  ['src/server/stdout/acp-events.js', 'session.buffer += output;', 1, 'other', 'an ACP harness\'s ring'],
  ['src/server/stdout/acp-events.js', 'session.buffer = cut >= 0 ? session.buffer.slice(cut + 1) : \'\'', 1, 'other', 'an ACP harness\'s ring (1.2 MB → 800 KB at a line)'],
  ['src/server/stdout/codex-events.js', 'session.buffer += output;', 1, 'other', 'codex\'s ring'],
  ['src/server/stdout/codex-events.js', 'session.buffer = session.buffer.slice(-800000);', 1, 'other', 'codex\'s ring (1.2 MB → 800 KB)'],
];
const WRITE_RE = /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.buffer\s*(?:\+=|=(?!=))/g;
const codeFiles = (() => { const out = []; out.push('server.js');   /* a list, never a spawn argv: test-fixture-isolation reads the file name closed by a list bracket as one */ const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'lib' && e.name !== 'agentd') walk(rel); } else if (/\.c?js$/.test(e.name)) out.push(rel); } }; walk('src'); return out; })();
function census(read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8'), rows = WRITES) {
  const red = [], seen = new Map();
  for (const f of codeFiles) {
    const src = read(f);
    if (!src.includes('.buffer')) continue;
    src.split('\n').forEach((line, i) => {
      const t = line.trim(); if (t.startsWith('//') || t.startsWith('*')) return;
      for (const m of line.matchAll(WRITE_RE)) {
        const rs = rows.filter((r) => r[0] === f && line.includes(r[1]));
        if (!rs.length) { red.push(`an UNROWED write of a session's ring: ${f}:${i + 1} «${t.slice(0, 120)}»`); continue; }
        for (const r of rs) { const key = r[0] + '\u0000' + r[1]; seen.set(key, (seen.get(key) || 0) + 1); if (r[3] === 'ring' && !/trimRing\([^;]+,\s*[A-Za-z_$][\w$]*\s*(?:,\s*[A-Za-z_$][\w$]*\s*)?\)/.test(line)) red.push(`${f}:${i + 1}: a claude ring's write not through trimRing(…, <session>)`); }
      }
    });
  }
  for (const r of rows) { const n = seen.get(r[0] + '\u0000' + r[1]) || 0; if (n !== r[2]) red.push(`${r[0]} «${r[1].slice(0, 60)}»: ${n} write(s), the row says ${r[2]}`); }
  return red;
}
{
  const red = census();
  ok(red.length === 0 && codeFiles.length > 300, `every write of a session's ring in ${codeFiles.length} hub files (every spelling: «<x>.buffer =» / «+=») is a row — the five claude ring writers through trimRing with their session, ${WRITES.filter((r) => r[3] === 'other').length} rows of the other rings named`, red.slice(0, 6));
  const sj = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const relSrv = anchored(sj, "s.buffer = require('./src/chat-ring.js').trimRing(s.buffer + JSON.stringify(userMsg) + '\\n', s, id);", "s.buffer = (s.buffer + JSON.stringify(userMsg) + '\\n').slice(-500000);", 'release-fifth');
  const r5 = census((f) => (f === 'server.js' ? relSrv : fs.readFileSync(path.join(ROOT, f), 'utf8')));
  ok(r5.some((x) => x.includes('server.js') && x.includes('UNROWED')), 'RED: the release\'s fifth writer (the automatic resume\'s .slice(-500000)) in a copy of server.js is named', r5.slice(0, 2));
  const planted = census((f) => (f === 'src/server/permission-answer.js' ? fs.readFileSync(path.join(ROOT, f), 'utf8') + '\nfunction x(sess) { sess.buffer = sess.buffer.slice(-1000); }\n' : fs.readFileSync(path.join(ROOT, f), 'utf8')));
  ok(planted.some((x) => x.includes('src/server/permission-answer.js') && x.includes('UNROWED')), 'RED: a new write planted under another spelling (sess.buffer) is named', planted.slice(0, 2));
}
for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 3, label: 'B-5a4d ring ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));

say(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
