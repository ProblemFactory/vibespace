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
//   ⑧ a batch claimed in HAND-OVER order by its witness (copyPrefixLen / claimedContent): [Y, X] under X's uuid ⇒ Y once;
//     the same words held and sent again ⇒ the held copy keeps its own bubble
//   THREE MUTANTS, red BY NAME (scratch copies, never src/): copyPrefixLen → 0 (the batch drawn twice), resolveRecord
//   dropped from the store's merge (every kept picture a placeholder), dropFiles a no-op (the .img files leak).
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

console.log('⑧ a batch claimed in HAND-OVER order by its witness');
// Alt+Enter X (held), Enter Y (handed: 1), the ⚡ on X (handed: 2) — the CLI's ONE record under X's uuid is [Y, X]
const bx = copyLine('m-x', 'u-x', [{ type: 'text', text: 'MARK-X held then bolted' }], 2), by = copyLine('m-y', 'u-y', [{ type: 'text', text: 'MARK-Y handed' }], 1);
const cliYX = { type: 'user', uuid: 'u-x', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'MARK-Y handed\n' }, { type: 'text', text: 'MARK-X held then bolted' }] } };
const yx = await restart(bx + '\n' + by, { jsonl: [cliYX] });
ok(view(yx).length === 2 && view(yx).filter((v) => /MARK-Y/.test(v.text)).length === 1 && view(yx).find((v) => v.msgId === 'm-x')?.text === 'MARK-X held then bolted', 'arrival X, Y; hand-over Y, X ⇒ [Y, X] under X\'s uuid: Y drawn ONCE, X its own words', view(yx));
// the same words held (Alt+Enter) and sent again (Enter, handed) — the handed one's record is its own, the held copy keeps its bubble
const sh = copyLine('m-h', 'u-h', [{ type: 'text', text: 'same words' }], 0), ss = copyLine('m-e', 'u-e', [{ type: 'text', text: 'same words' }], 1);
const cliE = { type: 'user', uuid: 'u-e', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'same words' }] } };
const same = await restart(sh + '\n' + ss, { jsonl: [cliE] });
ok(view(same).length === 2 && view(same).every((v) => v.text === 'same words') && view(same).some((v) => v.msgId === 'm-h') && view(same).some((v) => v.msgId === 'm-e'), 'the same words held and sent again: the held copy (hand-over 0) never takes the handed one\'s record — two bubbles, each its own', view(same));
const bb = copyLine('m-b', 'u-b', [{ type: 'text', text: 'IMG-B with a picture' }, img('B')], 1), bc = copyLine('m-c', 'u-c', [{ type: 'text', text: 'MARK-C two' }], 2);
const cliBC = { type: 'user', uuid: 'u-c', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'IMG-B with a picture' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG('B') } }, { type: 'text', text: 'MARK-C two' }] } };
const bcv = await restart(bb + '\n' + bc, { jsonl: [cliBC] });
ok(view(bcv).length === 2 && view(bcv).find((v) => v.msgId === 'm-b')?.pics === 1 && view(bcv).find((v) => v.msgId === 'm-c')?.text === 'MARK-C two' && view(bcv).find((v) => v.msgId === 'm-c')?.pics === 0, 'a batch [B words + picture, C] under C\'s uuid: B once with its picture, C alone', view(bcv));

console.log('THE THREE MUTANTS (scratch copies, never src/), each red BY NAME');
const M = mutantCopies('kept-copies', REPO);
const mmSrc = read('src/message-manager.js');
const PREFIX = 'function copyPrefixLen(copy, rec, off) {';
const mmMut = M.write('src/message-manager.js', mmSrc.replace(PREFIX, PREFIX + ' return 0;'), 'prefix0');
const MMx = require(mmMut);
const mx = new MMx.MessageManager(ID);
mx.convertHistory([...new SS.SessionMessages({ buffer: bb + '\n' + bc, cwd: dir, backend: 'claude', _keptFiles: await KC.preload(dir, ID, bb + '\n' + bc) }, ID, { buffersDir: dir }).raw(), cliBC]);
const mxv = view(mx.messages.filter((m) => m.role === 'user'));
ok(mmSrc.includes(PREFIX) && mxv.filter((v) => /IMG-B/.test(v.text)).length === 2, 'MUTANT copyPrefixLen → 0: RED — B drawn TWICE (its own bubble + inside C\'s)', mxv);
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
