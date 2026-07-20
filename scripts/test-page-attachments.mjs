#!/usr/bin/env node
// Regression test for CLI-injected PDF page images (2.194.0).
//
// A Read on a PDF ships the extracted pages into model context as image-only
// user records: LIVE = one {type:'user', isSynthetic:true} event PER PAGE
// (captured from a real claude 2.1.x stream — /tmp/pdf-stream-capture.ndjson
// method in the 2.194.0 changelog entry); JSONL = one isMeta:true record with
// N image blocks. Unflagged, the live burst rendered one bare "notification"
// stub per page (real report: a 10-page Read → 10 empty cards) and the
// history rebuild a giant "You" bubble.
//
// Asserts:
//  - live per-page burst coalesces into ONE imageAttachment message
//    (create + N-1 edit ops, content grows, no extra turnIndex)
//  - JSONL single isMeta record → ONE imageAttachment message
//  - a REAL user image paste (typed / no synthetic flags) is untouched
//  - a following real user message ends the coalesce run
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { MessageManager } = require('../src/message-manager.js');

let failed = 0;
const assert = (cond, name) => {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}`);
  if (!cond) failed++;
};

const img = (kb) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'A'.repeat(kb * 1024) } });
const pageEvent = (n) => ({ type: 'user', isSynthetic: true, message: { role: 'user', content: [img(n)] } });

// ── live per-page burst ──
{
  const mm = new MessageManager('t1');
  const ops = [];
  mm.onOp((op) => ops.push(op));
  const turnBefore = mm.turnIndex;
  mm.processLive(pageEvent(1));
  mm.processLive(pageEvent(2));
  mm.processLive(pageEvent(3));
  const atts = mm.messages.filter((m) => m.imageAttachment);
  assert(atts.length === 1, 'live burst coalesces to one message');
  assert(atts[0]?.content.length === 3, 'coalesced message holds all 3 pages');
  assert(atts[0]?.synthetic === true, 'flagged synthetic');
  assert(ops.filter((o) => o.op === 'create').length === 1, 'one create op');
  const edits = ops.filter((o) => o.op === 'edit');
  assert(edits.length === 2 && edits.every((o) => o.fields.status === 'complete'), 'two complete-status edit ops (re-render gate)');
  assert(edits[1]?.fields.content.length === 3, 'last edit carries full content');
  assert(mm.turnIndex === turnBefore, 'no turnIndex bump (not a conversation turn)');

  // a real user message afterwards ends the run and is NOT absorbed
  mm.processLive({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hello' }] }, promptSource: 'sdk' });
  mm.processLive(pageEvent(1));
  assert(mm.messages.filter((m) => m.imageAttachment).length === 2, 'new burst after a real message starts a NEW card');
  const real = mm.messages.find((m) => m.typed);
  assert(real && real.content[0].text === 'hello', 'real user message untouched');
}

// ── JSONL rebuild: one isMeta record with N blocks ──
{
  const mm = new MessageManager('t2');
  const msgs = mm.convertHistory([
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'read the pdf' }] }, promptSource: 'sdk' },
    { type: 'user', isMeta: true, message: { role: 'user', content: [img(1), img(2), img(1), img(3)] } },
  ]);
  const atts = msgs.filter((m) => m.imageAttachment);
  assert(atts.length === 1, 'history isMeta record → one attachment message');
  assert(atts[0]?.content.length === 4 && atts[0].content.every((b) => b.type === 'image'), 'all 4 pages present');
}

// ── real user image paste stays a user bubble ──
{
  const mm = new MessageManager('t3');
  // typed paste (webui)
  mm.processLive({ type: 'user', _fromWebui: true, message: { role: 'user', content: [img(2)] } });
  // external CLI paste: no synthetic/meta flags at all
  mm.processLive({ type: 'user', message: { role: 'user', content: [img(2), { type: 'text', text: 'look at this' }] } });
  assert(mm.messages.every((m) => !m.imageAttachment), 'user image pastes never flagged');
  assert(mm.messages.length === 2, 'both render as separate user messages');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
