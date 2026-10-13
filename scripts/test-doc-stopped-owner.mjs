#!/usr/bin/env node
// A STOPPED CONVERSATION IS AN ADDRESSEE (lane doc-comments-stopped-owner, B-b51a — found by lane doc-comments-ui
// 2026-10-12: comments sent to a document whose owning conversation had stopped were refused "Open this document from
// a chat…"). Measured: an exit takes the session out of activeSessions AND unlinks its data/session-meta file
// (src/server/session-stdout.js onExit), so `ownerOf` knew nothing about it. The engine now remembers every owner it
// resolved while live (src/server/doc-engine.js ownerMemo → data/doc-owners.json). Gate row `test-doc-stopped-owner`, fast.
//   ① a window opened from a live chat, the chat STOPS ⇒ Send all is stashed under its conversation, one entry per
//      message, in order (the REAL conversation-deliver over a scratch data dir)
//   ② a restart after the stop keeps the addressee (the memo is on disk; a fresh engine reads it)
//   ③ no conversation ever ⇒ no_owner, with the words that say so
//   ④ a live session without a typing pty ⇒ stashed (unchanged)
//   ⑤ a registry-owned document whose conversation stopped ⇒ stashed under the registry's conversation
//   ⑥ a save from the window of a stopped owner ⇒ ONE doc-edit note in its stash (the real registry's noteEdit)
//   ⑦ THE DRAIN: resumed (a new session id, the same conversation) then stopped again before a turn ⇒ nothing is
//      dropped; the next turn's drain (the REAL agent-routes drainStashUnderCap) delivers every message in order
//   ⑧ RED controls: a patched engine without the stopped rung answers no_owner (① red); a memo that never reaches
//      disk forgets the owner across a restart (② red)
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : '')); } return !!c; };
const ENGINE = path.join(REPO, 'src/server/doc-engine.js');
const DE = require(ENGINE);
const CD = require('../src/server/conversation-deliver.js');
const AR = require('../src/server/artifact-registry.js');
const { drainStashUnderCap } = require('../src/agent-routes.js');
const quiet = { log() { }, warn() { } };
const CID = '5b0c2e8a-7d1f-4c3e-9a61-0d2f8b7c6e15', CID2 = '9e4a1b3c-2d5f-4e6a-8b7c-1f0e2d3c4b5a';
const DOC = '/w/BRIEF.md';
const items = (n, tag = 'n') => Array.from({ length: n }, (_, i) => ({ quote: 'line ' + (i + 1), note: tag + ' ' + (i + 1) }));
/** a patched copy of the engine, compiled AS the engine file (its relative requires resolve) */
function patched(edit) {
  const src = fs.readFileSync(ENGINE, 'utf8'), out = edit(src);
  if (out === src) throw new Error('the patch did not apply');
  const m = new Module(ENGINE, null); m.filename = ENGINE; m.paths = Module._nodeModulePaths(path.dirname(ENGINE)); m._compile(out, ENGINE);
  return m.exports;
}
let worlds = 0;
function world({ dir = scratchDir('doc-stopped-owner-' + (++worlds)), engine = DE, sessions = null, registry = null, typing = true } = {}) {
  const activeSessions = sessions || new Map([['w1', { mode: 'chat', backend: 'claude', claudeSessionId: CID }]]);
  const deliver = CD.create({ dataDir: dir, activeSessions, serverSetting: () => undefined, log: () => { } });
  const sent = [];
  // THE typing sender's contract (src/server/user-input.js): no live session ⇒ no_session; a live one without a pty ⇒ not_chat
  const sendUserInput = (sid, text) => { if (!activeSessions.has(sid)) return { ok: false, code: 'no_session' }; if (!typing) return { ok: false, code: 'not_chat' }; sent.push({ sid, text }); return { ok: true, msgId: 'm' + sent.length }; };
  const mine = () => AR.configure({ activeSessions: () => activeSessions, deliver, sessionMeta: null, log: quiet }); // the registry is a module: each world re-points it before a call
  const artifacts = { ownerOf: (a) => (registry ? registry(a) : null), noteEdit: (a) => (mine(), AR.noteEdit(a)), touch: (a) => (mine(), AR.touch(a)) };
  const doc = engine.create({ activeSessions, getDeliver: () => deliver, sendUserInput, artifacts, dataDir: dir, now: () => 7 });
  return { dir, activeSessions, deliver, doc, sent };
}
const stop = (w, sid) => w.activeSessions.delete(sid);   // what session-stdout.js onExit does (and it unlinks the session-meta file)

console.log('① a chat that stopped: Send all waits in its stash, in order');
const w = world();
ok(w.doc.ownerOf({ path: DOC, from: 'w1' }).via === 'from', 'fixture: the window opened from a live chat (GET /api/doc/owner)');
const memo = JSON.parse(fs.readFileSync(path.join(w.dir, 'doc-owners.json'), 'utf8'));
ok(memo.s.w1 && memo.s.w1.cid === CID && !JSON.stringify(memo).includes('line 1'), 'the memo on disk: the window\'s session → its conversation (ids and paths only, never words)', memo);
stop(w, 'w1');
const r1 = w.doc.comments({ path: DOC, from: 'w1', items: items(25) });
const q1 = w.deliver.stashPeek(CID);
ok(r1.ok && r1.delivered === 'stashed' && r1.conversationId === CID && r1.count === 25 && r1.messages === 2 && r1.sent === 25, 'the chat stopped ⇒ delivered:stashed under its conversation, count/messages as today (25 notes ⇒ 2 messages)', r1);
ok(q1.length === 2 && q1.every((e) => e.source === 'doc-comment' && e.kind === 'peer' && e.fromName === DE.DOC_COMMENT_FROM) && q1[0].text.includes('① "line 1" — n 1') && q1[1].text.includes('n 25') && !q1[0].text.includes('n 25'), 'ONE stash entry per message, in order (the hot fix\'s shape)', q1.map((e) => e.text.slice(0, 60)));
ok(w.sent.length === 0, 'nothing was typed into a session that is gone');

console.log('② a restart after the stop keeps the addressee');
const w2 = world({ dir: w.dir, sessions: new Map() });
const o2 = w2.doc.ownerOf({ path: DOC, from: 'w1' });
ok(o2 && o2.via === 'stopped' && o2.conversationId === CID, 'a fresh engine over the same data dir: the stopped owner is still known', o2);
ok(w2.deliver.stashPeek(CID).length === 2, 'the stash survived the restart too (2 entries)');

console.log('③ no conversation at all ⇒ no_owner, said');
const r3 = w2.doc.comments({ path: DOC, from: 'never-seen', items: items(1) }), r3b = w2.doc.comments({ path: '/w/OTHER.md', from: '', items: items(1) });
ok(r3.code === 'no_owner' && r3b.code === 'no_owner' && r3.error === DE.NO_OWNER && /no conversation goes with this document/.test(DE.NO_OWNER), 'a session never seen live / no `from` ⇒ no_owner with "no conversation goes with this document"', r3);
const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ui = fs.readFileSync(path.join(REPO, 'src/lib/doc-window-ui.js'), 'utf8');
ok(zh.includes('"No conversation goes with this document — open it from a chat to comment": "这份文档没有对应的对话——从聊天里打开它再批注"') && ui.includes("t('No conversation goes with this document — open it from a chat to comment')") && !ui.includes('Open this document from a chat to send comments to it'), 'the window\'s owner line says it (en key + zh words; the old sentence gone)');

console.log('④ a live session without a typing pty ⇒ stashed (unchanged)');
const w4 = world({ typing: false });
const r4 = w4.doc.comments({ path: DOC, from: 'w1', items: items(3) });
ok(r4.ok && r4.delivered === 'stashed' && w4.deliver.stashPeek(CID).length === 1 && w4.doc.ownerOf({ path: DOC, from: 'w1' }).via === 'from', 'live, no pty ⇒ ONE stash entry, via from', r4);

console.log('⑤ a registry-owned document whose conversation stopped');
let live = true;
const w5 = world({ sessions: new Map([['w2', { mode: 'chat', backend: 'claude', claudeSessionId: CID2 }]]), registry: ({ path: p }) => (live && p === DOC ? { sessionId: 'w2', conversationId: CID2 } : null) });
ok(w5.doc.ownerOf({ path: DOC, from: '' }).via === 'registry', 'fixture: the registry owns the document while its chat lives');
live = false; stop(w5, 'w2');
const r5 = w5.doc.comments({ path: DOC, from: '', items: items(2) });
ok(r5.ok && r5.delivered === 'stashed' && r5.conversationId === CID2 && w5.deliver.stashPeek(CID2).length === 1, 'stopped ⇒ the registry\'s conversation still owns it: stashed there, no `from` needed', r5);
ok(w5.doc.comments({ path: '/w/ELSE.md', from: '', items: items(1) }).code === 'no_owner', 'the memo is per document: another file is not that conversation\'s');

console.log('⑥ a save from the window of a stopped owner');
const e6 = w2.doc.edited({ path: DOC, from: 'w1', summary: '+2 −0 lines' });
const n6 = w2.deliver.stashPeek(CID).filter((e) => e.source === 'doc-edit');
ok(e6.ok && e6.delivered === 'stashed' && n6.length === 1 && n6[0].text.startsWith('[Doc edit] /w/BRIEF.md: +2 −0 lines'), 'ONE [Doc edit] note in the stopped conversation\'s stash (noteEdit by conversationId)', { e6, n6 });

console.log('⑦ the drain: resumed, stopped again, then a turn');
const resumed = new Map([['w9', { mode: 'chat', backend: 'claude', claudeSessionId: CID }]]);   // a resume mints a new session id
const w7 = world({ dir: w.dir, sessions: resumed });
stop(w7, 'w9');   // stopped again before any turn
const w7b = world({ dir: w.dir, sessions: new Map([['w10', { mode: 'chat', backend: 'claude', claudeSessionId: CID }]]) });
ok(w7b.deliver.stashPeek(CID).length === 3, 'a second stop dropped nothing: 2 comment messages + the edit note still wait (read back after a restart)', w7b.deliver.stashPeek(CID).length);
const r7 = w7b.doc.comments({ path: DOC, from: 'w1', items: items(1, 'resumed') });
ok(r7.ok && r7.delivered === 'sent' && w7b.sent[0].sid === 'w10', 'resumed again: the next comment is TYPED into the live session of that conversation (not stashed)', r7);
const text = drainStashUnderCap(w7b.deliver, CID, 0, () => { });
const at = (s) => text.indexOf(s);
ok(text && at('n 1') > -1 && at('n 25') > at('n 1') && at('+2 −0 lines') > -1 && w7b.deliver.stashPeek(CID).length === 0, 'the next turn\'s drain (real drainStashUnderCap) delivers every message, in order, and empties the stash', text.slice(0, 300));

console.log('⑧ RED controls');
{
  const noRung = patched((s) => s.replace("return was ? { ...was, via: 'stopped' } : null;", 'return null;'));
  const m = world({ engine: noRung });
  m.doc.ownerOf({ path: DOC, from: 'w1' }); stop(m, 'w1');
  const r = m.doc.comments({ path: DOC, from: 'w1', items: items(3) });
  ok(r.code === 'no_owner' && m.deliver.stashPeek(CID).length === 0, 'CONTROL: without the stopped rung the comments are refused as no_owner (① would be red)', r);
  const noDisk = patched((s) => s.replace('    if (!file) return;\n    try {', '    if (file) return;\n    try {'));
  const d = world({ engine: noDisk });
  d.doc.ownerOf({ path: DOC, from: 'w1' }); stop(d, 'w1');
  const after = world({ engine: noDisk, dir: d.dir, sessions: new Map() });
  ok(!fs.existsSync(path.join(d.dir, 'doc-owners.json')) && after.doc.ownerOf({ path: DOC, from: 'w1' }) === null, 'CONTROL: a memo that never reaches disk forgets the owner across a restart (② would be red)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
