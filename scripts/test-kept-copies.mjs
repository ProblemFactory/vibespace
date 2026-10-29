#!/usr/bin/env node
// THE KEPT COPIES, IN THE TREE (lane claude-steer-inject r6 — acceptance r5 found every r5 road covered only by lane-dir
// harnesses: three mutants left `node scripts/ci.mjs` green). A claude wrapper's restart copy of a person's mid-turn frame
// names its pictures (and a long text) as files beside its buffer (src/kept-copies.js — the wrapper writes through it, the
// restore reads through it); this suite drives each road with a fixture buffer through the REAL store (src/session-store.js
// SessionMessages) and the REAL normalizer, in-process:
//   ① keepBlock writes the file; the reference carries {sha, ext} only; a client-built kept block is stripped (and the
//     input road refuses one by name: the claude adapter's formatChatInput)
//   ② the read-back after a restart: the restore's preload (async) → the merge resolves the copy with no fs call
//   ③ a reference whose file is gone ⇒ the placeholder (`gone`) — and the renderer's words for it
//   ④ the CLI's loss lines beside the picture (claimedContent)
//   ⑤ the wrapper's settle deletes a witnessed frame's files and keeps a file a pending copy still names; the ring's pin
//     keeps a pending copy through a trim
//   ⑥ the age sweep takes an old `<id>.img` folder (src/server/wrapper-files.js), never a young or a live one; the kill
//     path / retireDuplicate / ws close take it with the buffer (off the loop)
//   ⑦ A REFERENCE OPENS ONLY ITS OWN SESSION'S FILE — a forged `OTHER.img/<sha>.png` (r5's shape) and a sibling's sha ⇒
//     the placeholder, 0 bytes of the other session's file
//   ⑧ a batch claimed by the stamps its init names (copyPrefixLen / claimedContent): [Y, X] under X's uuid ⇒ Y once;
//     the same words held and sent again ⇒ the held copy keeps its own bubble
//   ⑨ (r8) THE POOL HOLDS ONLY FRAMES THAT RAN: a copy still held claims nothing and is claimed by nothing (the same words
//     held twice, the later one run first ⇒ each once); a stamped copy joins only by its stamp, a stampless one (an older
//     build) by its FULL words once it was handed — never a prefix
//   FOUR MUTANTS, red BY NAME (scratch copies, never src/): copyPrefixLen → 0 (the batch drawn twice), resolveRecord
//   dropped from the store's merge (every kept picture a placeholder), dropFiles a no-op (the .img files leak), every copy
//   pooled by its words (r7's road: a still-held copy drawn twice).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const KC = require(path.join(REPO, 'src/kept-copies.js'));
const SS = require(path.join(REPO, 'src/session-store.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const dir = scratch('kept-copies'); fs.mkdirSync(dir, { recursive: true });
const ID = 'sess-kept-1', OTHER = 'sess-kept-2';
const PNG = (c) => Buffer.from('\x89PNG\r\n\x1a\n' + c.repeat(64), 'latin1').toString('base64');
const img = (c) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG(c) } });
const copyLine = (msgId, cliUuid, blocks, handNo, dirOf = KC.keptDirOf(dir, ID)) => JSON.stringify({ type: 'user', message: { role: 'user', content: blocks.map((b) => KC.keepBlock(b, dirOf)) }, msgId, cliUuid, handNo, _fromWebui: true, webui_copy: true, timestamp: new Date(Date.now() - 60000).toISOString() });
/** THE RESTART: the buffer through the store's merge (the restore's preload first) and the normalizer's history road. */
async function restart(buffer, { SSx = SS, id = ID, jsonl = [] } = {}) {
  const kept = await KC.preload(dir, id, buffer);
  const session = { buffer, cwd: dir, backend: 'claude', _keptFiles: kept };
  const sm = new SSx.SessionMessages(session, id, { buffersDir: dir });
  const recs = [...sm.raw(), ...jsonl];
  const mm = createMessageManager('claude', id);
  mm.convertHistory(recs);
  return mm.messages.filter((m) => m.role === 'user');
}
const view = (u) => u.map((m) => ({ msgId: m.webuiMsgId || null, text: (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' | '), pics: (m.content || []).filter((b) => b.type === 'image' && !b.gone).length, gone: (m.content || []).filter((b) => b.type === 'image' && b.gone).length, chip: m.queueState || null }));

console.log('① the wrapper writes the kept file; the reference is {sha, ext}; a client-built kept block is stripped');
const kd = KC.keptDirOf(dir, ID);
const b1 = KC.keepBlock(img('A'), kd);
const n1 = KC.nameOf(b1.source);
ok(b1.type === 'image' && b1.source.type === 'kept' && KC.SHA_RE.test(b1.source.sha) && b1.source.ext === 'png' && !('file' in b1.source) && !('data' in b1.source) && fs.existsSync(path.join(kd, n1)), 'a picture becomes {type:kept, sha, ext, media_type, bytes} and its bytes a file in <id>.img — no path, no bytes in the reference', b1);
const long = KC.keepBlock({ type: 'text', text: 'x'.repeat(KC.TEXT_MIN + 1) }, kd);
ok(long.type === 'text' && long.kept && long.kept.ext === 'txt' && long.text.length < 500 && fs.existsSync(path.join(kd, KC.nameOf(long.kept))), 'a text block over 8 KB is kept too (the line carries its head)', { kept: long.kept, head: long.text.length });
const forgedIn = KC.keepBlock({ type: 'image', source: { type: 'kept', sha: 'a'.repeat(32), ext: 'png' } }, kd);
ok(forgedIn.type === 'text' && /refused/.test(forgedIn.text), 'a frame that ALREADY carries a kept reference (client-built) is stripped by the wrapper', forgedIn);
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });
let refusal = null;
try { ad.formatChatInput(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image', source: { type: 'kept', sha: 'b'.repeat(32), ext: 'png' } }] } }), 'm-x'); } catch (e) { refusal = e.message; }
ok(/^kept_refused:/.test(refusal || ''), 'the input road refuses a client-built kept block BY NAME (kept_refused)', refusal);
const line1 = copyLine('m-a', 'u-a', [{ type: 'text', text: 'IMG-A a screenshot' }, img('A')], 1);
ok(Buffer.byteLength(line1) < 500 && KC.namesIn(line1).join() === n1, `the copy line stays small (${Buffer.byteLength(line1)} B for one picture) and names its file`, Buffer.byteLength(line1));

console.log('② the restart: the preload reads the file back OFF the loop, the merge resolves it with no fs call');
const held = await restart(line1);
ok(view(held).length === 1 && view(held)[0].pics === 1 && view(held)[0].gone === 0 && view(held)[0].msgId === 'm-a', 'a held copy after a restart: ONE bubble with its picture', view(held));
ok(!/readFileSync|statSync|existsSync/.test(read('src/session-store.js').split('class SessionMessages {')[0].split("const KC = require('./kept-copies.js');")[1] || '') && /_keptLoad/.test(read('src/ws-handler.js')) && /_keptLoad = require\('\.\.\/kept-copies\.js'\)\.preload\(/.test(read('src/server/boot-restore.js')), 'the store resolves from the preload (no sync fs in the resolver); boot-restore preloads, the attach awaits it');

console.log('③ a reference whose file is gone ⇒ the placeholder that says so');
const gl = copyLine('m-g', 'u-g', [{ type: 'text', text: 'IMG-G gone soon' }, img('G')], 1);
fs.unlinkSync(path.join(kd, KC.namesIn(gl)[0]));
const gone = await restart(gl);
ok(view(gone)[0].gone === 1 && view(gone)[0].pics === 0, 'the file swept ⇒ the bubble keeps its words and a `gone` picture (never nothing)', view(gone));
ok(/b\.type === 'image' && b\.gone\) return `<div class="chat-media chat-media-gone">/.test(read('src/lib/chat-renderers.js')) && /t\('Picture no longer kept'\)/.test(read('src/lib/chat-renderers.js')), 'the renderer draws «Picture no longer kept» for it');

console.log('④ the CLI\'s loss lines beside the picture');
const l3 = copyLine('m-3', 'u-3', [{ type: 'text', text: 'IMG-3 three' }, img('X'), img('Y'), img('Z')], 1);
const cli3 = { type: 'user', uuid: 'u-3', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'IMG-3 three' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG('X') } }, { type: 'text', text: '[Image could not be processed: bad]' }, { type: 'text', text: '[Image could not be processed: bad]' }] } };
const three = await restart(l3, { jsonl: [cli3] });
ok(view(three).length === 1 && view(three)[0].pics === 3 && (view(three)[0].text.match(/could not be processed/g) || []).length === 2, 'three pictures AND the CLI\'s two «could not be processed» lines, one bubble', view(three));

console.log('⑤ the wrapper\'s settle and the ring\'s pin (the functions it calls)');
const p1 = copyLine('m-p', 'u-p', [{ type: 'text', text: 'pending' }, img('P')], 0);
const s1 = copyLine('m-s', 'u-s', [{ type: 'text', text: 'settled' }, img('S'), img('P')], 2);
const drop = KC.namesToDrop(s1, [p1]);
KC.dropFiles(kd, drop);
ok(drop.length === 1 && !fs.existsSync(path.join(kd, drop[0])) && fs.existsSync(path.join(kd, KC.namesIn(p1)[0])), 'a witnessed frame\'s files go; a file a pending copy still names stays', { drop });
const ring = 'x\n' + p1 + '\n' + 'y\n', still = 'z\n';
ok(KC.pinnedLines(ring, still, [p1]).join() === p1 && KC.pinnedLines(ring, still + p1 + '\n', [p1]).length === 0, 'the ring\'s pin writes a pending copy the trim cut back at the head (and never twice)');
const w = read('data/bin/chat-wrapper.js');
ok(/KC\.pinnedLines\(gone, buffer,/.test(w) && /KC\.dropFiles\(KEPT_DIR, KC\.namesToDrop\(c\.line,/.test(w) && /settleCopies\(ids\)/.test(w) && /settleCopy\(dropped\.msgId\)/.test(w), 'the wrapper calls them: the trim pins, a settle (witnessed / dropped) drops');

console.log('⑤b THE CAP: a session\'s kept bytes are bounded — the oldest files go (their copies draw the placeholder)');
const cd = path.join(dir, 'cap-1.img'); fs.mkdirSync(cd, { recursive: true });
for (let i = 0; i < 5; i++) { const f = path.join(cd, `${String(i).repeat(32)}.png`); fs.writeFileSync(f, Buffer.alloc(400)); const t = (Date.now() - (10 - i) * 1000) / 1000; fs.utimesSync(f, t, t); }
const evicted = KC.capDir(cd, 1000);
ok(evicted.length === 3 && evicted[0].startsWith('0') && fs.readdirSync(cd).length === 2 && KC.CAP_BYTES === 64 * 1024 * 1024, 'past the cap the OLDEST files are evicted until the folder fits (64 MB in the product)', { evicted, left: fs.readdirSync(cd) });
ok(/KC\.capDir\(KEPT_DIR\)/.test(read('data/bin/chat-wrapper.js')), 'the wrapper caps its folder after every copy it writes');

console.log('⑥ the age sweep, the kill path, retireDuplicate, ws close');
const WF = require(path.join(REPO, 'src/server/wrapper-files.js'));
const sw = scratch('kept-copies-sweep'); fs.mkdirSync(sw, { recursive: true });
for (const n of ['old-1', 'young-1', 'live-1']) { fs.mkdirSync(path.join(sw, n + '.img')); fs.writeFileSync(path.join(sw, n + '.img', 'a.png'), 'x'); }
const past = (Date.now() - 9 * 86400000) / 1000; fs.utimesSync(path.join(sw, 'old-1.img'), past, past); fs.utimesSync(path.join(sw, 'live-1.img'), past, past);
WF.sweepAgedWrapperFiles(sw, { cutoff: Date.now() - 7 * 86400000, isActive: (id) => id === 'live-1' });
ok(!fs.existsSync(path.join(sw, 'old-1.img')) && fs.existsSync(path.join(sw, 'young-1.img')) && fs.existsSync(path.join(sw, 'live-1.img')), 'the 7-day sweep takes an old <id>.img folder, never a young or a live one');
ok(/fs\.rm\(path\.join\(BUFFERS_DIR, id \+ '\.img'\)/.test(read('src/server/session-stdout.js')) && /fs\.rm\(path\.join\(BUFFERS_DIR, id \+ '\.img'\)/.test(read('src/server/boot-restore.js')) && /fs\.rm\(path\.join\(BUFFERS_DIR, data\.sessionId \+ '\.img'\)/.test(read('src/ws-handler.js')), 'the kill path, retireDuplicate and ws close take <id>.img beside <id>.buf — off the loop (fs.rm)');

console.log('⑦ a reference opens only its OWN session\'s file');
const od = KC.keptDirOf(dir, OTHER);
const secret = KC.keepBlock({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from('OTHER-SESSION-SECRET-PICTURE').toString('base64') } }, od);
const forgedR5 = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'forged' }, { type: 'image', source: { type: 'kept', file: OTHER + '.img/' + KC.nameOf(secret.source), media_type: 'image/png' } }] }, msgId: 'm-f', cliUuid: 'u-f', handNo: 1, _fromWebui: true, webui_copy: true, timestamp: new Date().toISOString() });
const forgedSib = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'sibling' }, { type: 'image', source: { type: 'kept', sha: secret.source.sha, ext: 'png', media_type: 'image/png' } }] }, msgId: 'm-s2', cliUuid: 'u-s2', handNo: 1, _fromWebui: true, webui_copy: true, timestamp: new Date().toISOString() });
const fr = await restart(forgedR5 + '\n' + forgedSib);
const leaked = JSON.stringify(fr).includes(Buffer.from('OTHER-SESSION-SECRET-PICTURE').toString('base64'));
ok(view(fr).every((v) => v.gone === 1 && v.pics === 0) && !leaked, 'a forged `OTHER.img/<sha>.png` reference AND another session\'s sha ⇒ the placeholder, 0 bytes of the other session\'s file', view(fr));

console.log('⑧ a batch claimed by the stamps its init names');
// THE TURN'S INIT names every stamped frame it consumed, in order — measured on 2.1.308 and 2.1.312 (two frames written
// mid-turn, run together: init.user_message_uuids [C, D], ONE user record under D's uuid, [C\n, D])
const initOf = (...uuids) => JSON.stringify({ type: 'system', subtype: 'init', session_id: 'cli-sess-kept', user_message_uuids: uuids });
const handed = (...ids) => JSON.stringify({ type: 'input_handover', state: 'handed', msg_ids: ids });
// Alt+Enter X (held), Enter Y (handed: 1), the ⚡ on X (handed: 2) — the CLI's ONE record under X's uuid is [Y, X]
const bx = copyLine('m-x', 'u-x', [{ type: 'text', text: 'MARK-X held then bolted' }], 2), by = copyLine('m-y', 'u-y', [{ type: 'text', text: 'MARK-Y handed' }], 1);
const cliYX = { type: 'user', uuid: 'u-x', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'MARK-Y handed\n' }, { type: 'text', text: 'MARK-X held then bolted' }] } };
const yx = await restart([bx, by, initOf('u-y', 'u-x')].join('\n'), { jsonl: [cliYX] });
ok(view(yx).length === 2 && view(yx).filter((v) => /MARK-Y/.test(v.text)).length === 1 && view(yx).find((v) => v.msgId === 'm-x')?.text === 'MARK-X held then bolted', 'arrival X, Y; hand-over Y, X ⇒ [Y, X] under X\'s uuid: Y drawn ONCE, X its own words', view(yx));
// the same words held (Alt+Enter) and sent again (Enter, handed) — the handed one's record is its own, the held copy keeps its bubble
const sh = copyLine('m-h', 'u-h', [{ type: 'text', text: 'same words' }], 0), ss = copyLine('m-e', 'u-e', [{ type: 'text', text: 'same words' }], 1);
const cliE = { type: 'user', uuid: 'u-e', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'same words' }] } };
const same = await restart([sh, ss, initOf('u-e')].join('\n'), { jsonl: [cliE] });
ok(view(same).length === 2 && view(same).every((v) => v.text === 'same words') && view(same).some((v) => v.msgId === 'm-h') && view(same).some((v) => v.msgId === 'm-e'), 'the same words held and sent again: the held copy (hand-over 0) never takes the handed one\'s record — two bubbles, each its own', view(same));
// (r7) THE STAMP IS THE WITNESS: the hub restored the copy while its frame was HELD (handNo 0 — the wrapper's later number
// never reaches the hub), the turn ended, the frame drained and the CLI wrote its record under the stamped uuid ⇒ ONE bubble
const hd = copyLine('m-hd', 'u-hd', [{ type: 'text', text: 'MARK-H held across a restart' }], 0);
const cliHd = { type: 'user', uuid: 'u-hd', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'MARK-H held across a restart' }] } };
const hdv = await restart(hd, { jsonl: [cliHd] });
ok(view(hdv).length === 1 && view(hdv)[0].msgId === 'm-hd', '(r7) a frame held at the restart, drained before the first attach: its record (the stamp) claims the copy that says 0 — ONE bubble (r6: two)', view(hdv));
// …and two held at the restart, both ⚡-handed after it (the copies still say 0 at the hub): ONE record under the last
// stamp, its init naming both ⇒ each once
const h1 = copyLine('m-h1', 'u-h1', [{ type: 'text', text: 'MARK-P first held' }], 0), h2 = copyLine('m-h2', 'u-h2', [{ type: 'text', text: 'MARK-Q second held' }], 0);
const cliH12 = { type: 'user', uuid: 'u-h2', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'MARK-P first held\n' }, { type: 'text', text: 'MARK-Q second held' }] } };
const h12 = await restart([h1, h2, handed('m-h1'), handed('m-h2'), initOf('u-h1', 'u-h2')].join('\n'), { jsonl: [cliH12] });
ok(view(h12).length === 2 && view(h12).filter((v) => /MARK-P/.test(v.text)).length === 1 && view(h12).find((v) => v.msgId === 'm-h2')?.text === 'MARK-Q second held', '(r7→r8) two held at the restart, both handed after it, run as one batch whose init names both stamps: each drawn ONCE', view(h12));
const bb = copyLine('m-b', 'u-b', [{ type: 'text', text: 'IMG-B with a picture' }, img('B')], 1), bc = copyLine('m-c', 'u-c', [{ type: 'text', text: 'MARK-C two' }], 2);
const cliBC = { type: 'user', uuid: 'u-c', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'IMG-B with a picture' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG('B') } }, { type: 'text', text: 'MARK-C two' }] } };
const bcBuf = [bb, bc, initOf('u-b', 'u-c')].join('\n');
const bcv = await restart(bcBuf, { jsonl: [cliBC] });
ok(view(bcv).length === 2 && view(bcv).find((v) => v.msgId === 'm-b')?.pics === 1 && view(bcv).find((v) => v.msgId === 'm-c')?.text === 'MARK-C two' && view(bcv).find((v) => v.msgId === 'm-c')?.pics === 0, 'a batch [B words + picture, C] under C\'s uuid: B once with its picture, C alone', view(bcv));

console.log('⑨ (r8) the pool holds only frames that RAN — a still-held copy claims nothing and is claimed by nothing');
// two held at the restart (both say 0): H1 «continue», H2 «continue» + a picture; the ⚡ on H2 — its record comes first
// (its init names it alone), H1 drains at the turn end (its own init, its own record) ⇒ each ONCE (r7: H1 taken by H2's
// leading words, then drawn again from its own record)
const q1 = copyLine('m-q1', 'u-q1', [{ type: 'text', text: 'continue' }], 0), q2 = copyLine('m-q2', 'u-q2', [{ type: 'text', text: 'continue' }, img('P')], 0);
const recP2 = { type: 'user', uuid: 'u-q2', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'continue' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG('P') } }] } };
const recP1 = { type: 'user', uuid: 'u-q1', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'continue' }] } };
const pBuf = [q1, q2, handed('m-q2'), initOf('u-q2')].join('\n');
const pv = await restart(pBuf, { jsonl: [recP2, { type: 'system', subtype: 'init', session_id: 'cli-sess-kept', user_message_uuids: ['u-q1'] }, recP1] });
ok(view(pv).length === 2 && view(pv).filter((v) => v.msgId === 'm-q1').length === 1 && view(pv).find((v) => v.msgId === 'm-q2')?.pics === 1 && view(pv).every((v) => v.msgId), 'the same words held twice, the later one run first: the still-held one is never in its pool — each drawn ONCE (r7: three bubbles)', view(pv));
// …and with no init at all (a ring that lost it, a CLI before 2.1.307): the still-held copy is still never pooled
const pn = await restart([q1, q2].join('\n'), { jsonl: [recP2, recP1] });
ok(view(pn).length === 2 && view(pn).filter((v) => v.msgId === 'm-q1').length === 1, 'with no init naming the turn\'s stamps: a stamped copy is never claimed by another frame\'s words — each once', view(pn));
// the same while H1 is STILL held (its record not yet written): H1 keeps its own bubble, its words never taken
const ph = await restart(pBuf, { jsonl: [recP2] });
ok(view(ph).length === 2 && view(ph).find((v) => v.msgId === 'm-q1')?.text === 'continue' && view(ph).find((v) => v.msgId === 'm-q2')?.text === 'continue', 'while H1 is still held: its bubble stands, H2\'s bubble is H2\'s words alone', view(ph));
// THE STAMP, NOT THE WORDS: a frame that RAN (handed) whose words begin the hit's record, but the hit's init names only the
// hit — it is not in this batch (it waits for its own record, its own stamp)
const z1 = copyLine('m-z1', 'u-z1', [{ type: 'text', text: 'same start' }], 1), z2 = copyLine('m-z2', 'u-z2', [{ type: 'text', text: 'same start' }, { type: 'text', text: 'and more' }], 2);
const recZ2 = { type: 'user', uuid: 'u-z2', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'same start' }, { type: 'text', text: 'and more' }] } };
const zv = await restart([z1, z2, handed('m-z1'), handed('m-z2'), initOf('u-z2')].join('\n'), { jsonl: [recZ2] });
ok(view(zv).length === 2 && view(zv).find((v) => v.msgId === 'm-z1')?.text === 'same start' && view(zv).find((v) => v.msgId === 'm-z2')?.text === 'same start | and more', 'a handed frame whose words begin another\'s record, its stamp NOT named by that turn\'s init: not claimed — each its own words', view(zv));
// THE LEGACY FALLBACK: a copy WITHOUT a stamp (an older build) is matched by its FULL words — only once it was handed
const lg = (msgId, text) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, msgId, _fromWebui: true, webui_copy: true, timestamp: new Date(Date.now() - 60000).toISOString() });
const lHit = copyLine('m-lh', 'u-lh', [{ type: 'text', text: 'LEG-H the last' }], 0);
const recL = { type: 'user', uuid: 'u-lh', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'LEG-A legacy words\n' }, { type: 'text', text: 'LEG-H the last' }] } };
const lv = await restart([lg('m-la', 'LEG-A legacy words'), lHit, handed('m-la')].join('\n'), { jsonl: [recL] });
ok(view(lv).length === 2 && view(lv).find((v) => v.msgId === 'm-lh')?.text === 'LEG-H the last' && view(lv).filter((v) => /LEG-A/.test(v.text)).length === 1, 'a copy without a stamp, handed: claimed by its FULL words off the front — drawn once', view(lv));
const lHeld = await restart([lg('m-la', 'LEG-A legacy words'), lHit].join('\n'), { jsonl: [recL] });
ok(view(lHeld).filter((v) => v.msgId === 'm-la').length === 1 && /LEG-A/.test(view(lHeld).find((v) => v.msgId === 'm-lh')?.text || ''), 'a copy without a stamp that was never handed (still held): not claimed by its words', view(lHeld));
const lPre = await restart([lg('m-la', 'LEG-A legacy'), lHit, handed('m-la')].join('\n'), { jsonl: [recL] });
ok(view(lPre).filter((v) => v.msgId === 'm-la').length === 1 && view(lPre).find((v) => v.msgId === 'm-la')?.text === 'LEG-A legacy', 'a copy without a stamp whose words only BEGIN a block of the record: never a prefix — not claimed', view(lPre));

console.log('THE FOUR MUTANTS (scratch copies, never src/), each red BY NAME');
const M = mutantCopies('kept-copies', REPO);
const mmSrc = read('src/message-manager.js');
const PREFIX = 'function copyPrefixLen(copy, rec, off) {';
const mmMut = M.write('src/message-manager.js', mmSrc.replace(PREFIX, PREFIX + ' return 0;'), 'prefix0');
const MMx = require(mmMut);
const mx = new MMx.MessageManager(ID);
mx.convertHistory([...new SS.SessionMessages({ buffer: bcBuf, cwd: dir, backend: 'claude', _keptFiles: await KC.preload(dir, ID, bcBuf) }, ID, { buffersDir: dir }).raw(), cliBC]);
const mxv = view(mx.messages.filter((m) => m.role === 'user'));
ok(mmSrc.includes(PREFIX) && mxv.filter((v) => /IMG-B/.test(v.text)).length === 2, 'MUTANT copyPrefixLen → 0: RED — B drawn TWICE (its own bubble + inside C\'s)', mxv);
// r7's road: every other copy pooled, matched by its words — the still-held H1 taken by H2's leading words, then drawn again
const POOLED = '(c.cliUuid ? named.includes(c.cliUuid) : c.ran === true)';
const MMw = require(M.write('src/message-manager.js', mmSrc.replace(POOLED, 'true'), 'words-pool'));
const mw = new MMw.MessageManager(ID);
mw.convertHistory([...new SS.SessionMessages({ buffer: pBuf, cwd: dir, backend: 'claude', _keptFiles: await KC.preload(dir, ID, pBuf) }, ID, { buffersDir: dir }).raw(), recP2, { type: 'system', subtype: 'init', session_id: 'cli-sess-kept', user_message_uuids: ['u-p1'] }, recP1]);
const mwv = view(mw.messages.filter((m) => m.role === 'user'));
ok(mmSrc.includes(POOLED) && mwv.length === 3 && mwv.filter((v) => v.text === 'continue' && !v.pics).length === 2, 'MUTANT every copy pooled by its words (r7\'s road): RED — the still-held «continue» drawn TWICE (three bubbles for two messages)', mwv);
const ssSrc = read('src/session-store.js');
const RESOLVE = "parsed.push(rec && rec.webui_copy ? KC.resolveRecord(rec, kept, ";
const ssMut = M.write('src/session-store.js', ssSrc.replace(RESOLVE, 'parsed.push(rec && false ? KC.resolveRecord(rec, kept, '), 'no-resolve');
const SSx = require(ssMut);
const nr = await restart(line1, { SSx });
ok(ssSrc.includes(RESOLVE) && view(nr)[0].pics === 0 && view(nr)[0].gone === 1, 'MUTANT the store\'s merge without resolveRecord: RED — every kept picture a placeholder', view(nr));
const kcSrc = read('src/kept-copies.js');
const DROP = 'function dropFiles(dir, names) {';
const KCx = require(M.write('src/kept-copies.js', kcSrc.replace(DROP, DROP + ' return;'), 'no-drop'));
const leakLine = copyLine('m-l', 'u-l', [{ type: 'text', text: 'leak' }, img('L')], 1);
KCx.dropFiles(kd, KCx.namesToDrop(leakLine, []));
ok(kcSrc.includes(DROP) && fs.existsSync(path.join(kd, KC.namesIn(leakLine)[0])), 'MUTANT dropFiles a no-op: RED — a settled copy\'s .img file LEAKS', KC.namesIn(leakLine));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
