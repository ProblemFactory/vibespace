#!/usr/bin/env node
// UNKNOWN RECORDS ARE SHOWN, NOT DROPPED (2.369.119, owner: "你对于未知的 event 似乎是
// 直接过滤掉，而不是前端渲染收到一个未知 event，提醒我 claude code 之类的 harness 可能加了
// 新功能或者解决了之前存在的问题"). A record type or system subtype the normalizer does
// not handle — and that is not on its DECLARED known-ignored list (records the
// server consumer or the transcript bookkeeping own) — becomes ONE dim card per
// name per session with an escaped, bounded sample. rate_limit_event (2.289.0),
// tool_progress (2.227.7) and model_refusal_fallback (2.227.4) were each an
// invisible gap for weeks; this makes the next one visible in the chat itself.
// Run: node scripts/test-unknown-records.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const MM = require(path.join(REPO, 'src/message-manager.js'));
const cards = (mm) => mm.messages.filter((m) => m.noticeKind === 'unknown-record');

console.log('§1 claude: an unknown TOP-LEVEL type and an unknown SYSTEM subtype each become one card, live');
{
  const mm = createMessageManager('claude', 'test-unknown-1');
  const ops = []; mm.listeners.push((e) => ops.push(e));
  mm.processLive({ type: 'brand_new_record', payload: { x: 1, secretish: 'a'.repeat(500) } });
  mm.processLive({ type: 'brand_new_record', payload: { x: 2 } });
  mm.processLive({ type: 'system', subtype: 'vcs_state_changed', branch: 'main', dirty: true });
  mm.processLive({ type: 'system', subtype: 'vcs_state_changed', branch: 'dev', dirty: false });
  mm.processLive({ type: 'system', subtype: 'code_change_published', url: 'https://example.invalid/x' });
  const c = cards(mm);
  ok('three cards: one per unknown name (a repeat does not add a second)', c.length === 3, c.map((m) => m.content[0].name));
  const b = c[0].content[0];
  ok('the card block names kind + name + harness and carries a BOUNDED sample (≤ 700 chars, long strings clipped)', b.type === 'unknown_record' && b.kind === 'type' && b.name === 'brand_new_record' && b.harness === 'Claude Code' && typeof b.sample === 'string' && b.sample.length <= 700 && !b.sample.includes('a'.repeat(300)), b);
  ok('the system one says system/<subtype>', c[1].content[0].kind === 'system' && c[1].content[0].name === 'vcs_state_changed');
  ok('the cards were EMITTED as create ops (a live window sees them)', ops.filter((o) => o.op === 'create' && o.msg && o.msg.noticeKind === 'unknown-record').length === 3);
}

console.log('§2 negative controls: handled, known-ignored and history never produce a card');
{
  const mm = createMessageManager('claude', 'test-unknown-2');
  for (const type of MM.KNOWN_IGNORED_RECORD_TYPES) mm.processLive({ type, anything: 1 });
  for (const sub of MM.HANDLED_SYSTEM_SUBTYPES) mm.processLive({ type: 'system', subtype: sub });
  for (const sub of MM.KNOWN_IGNORED_SYSTEM_SUBTYPES) mm.processLive({ type: 'system', subtype: sub });
  mm.processLive({ type: 'system', subtype: 'task_progress', tool_use_id: 'toolu_none', task_id: 't1' }); // task_* under a tool_use_id never trips it
  ok(`no card for any handled (${MM.HANDLED_SYSTEM_SUBTYPES.size}) / known-ignored subtype (${MM.KNOWN_IGNORED_SYSTEM_SUBTYPES.size}) / known-ignored top-level type (${MM.KNOWN_IGNORED_RECORD_TYPES.size})`, cards(mm).length === 0, cards(mm).map((m) => m.content[0].name));
  // the census of the live buffers + transcripts on 2026-09-20: every type/subtype seen must be handled or DECLARED ignored, or it is by definition a card
  const consumer = read('src/server/stdout/claude-stream-json.js');
  const consumerTypes = [...consumer.matchAll(/msg\.type === '([a-z_]+)'/g)].map((m) => m[1]).filter((t) => !['system', 'assistant', 'user', 'result', 'control_response', 'attachment'].includes(t));
  const missing = consumerTypes.filter((t) => !MM.KNOWN_IGNORED_RECORD_TYPES.has(t));
  ok(`every top-level type the SERVER consumer handles is on the normalizer's known-ignored list (${consumerTypes.length} checked)`, missing.length === 0, missing);
  const transcriptTypes = ['queue-operation', 'last-prompt', 'custom-title', 'agent-name', 'permission-mode', 'mode', 'pr-link', 'atis-latch', 'file-history-snapshot', 'file-history-delta', 'cost-state', 'summary', 'progress'];
  const mm2 = createMessageManager('claude', 'test-unknown-3');
  mm2.convertHistory(transcriptTypes.map((type) => ({ type, uuid: 'u-' + type })));
  ok('HISTORY conversion never creates a card (bookkeeping records of the transcript are declared ignored; the live path is the alert)', cards(mm2).length === 0);
  const mm3 = createMessageManager('claude', 'test-unknown-4');
  mm3.convertHistory([{ type: 'never_seen_before', uuid: 'u1' }, { type: 'system', subtype: 'never_seen_subtype', uuid: 'u2' }]);
  ok('…even for an unknown type (a rebuild must not re-alert on every attach)', cards(mm3).length === 0);
}

console.log('§3 codex: an unknown record becomes a card too');
{
  const mm = createMessageManager('codex', 'test-unknown-codex');
  const ops = []; mm.listeners.push((e) => ops.push(e));
  mm.processLive({ type: 'totally_new_codex_record', foo: 'bar' });
  mm.processLive({ type: 'totally_new_codex_record', foo: 'baz' });
  const c = cards(mm);
  ok('one card per unknown codex record type, harness named', c.length === 1 && c[0].content[0].harness === 'Codex' && /totally_new_codex_record/.test(c[0].content[0].name), c.map((m) => m.content[0]));
}

console.log('§4 the renderer escapes everything and folds the sample');
{
  const cr = read('src/lib/chat-renderers.js');
  const branch = cr.slice(cr.indexOf("noticeKind === 'unknown-record'"), cr.indexOf("noticeKind === 'unknown-record'") + 2500);
  ok('renderSystemMsg has the unknown-record branch: escHtml on name + harness + sample, sample behind <details>', /escHtml\(b\.name\)/.test(branch) && /escHtml\(b\.harness/.test(branch) && /escHtml\(b\.sample\)/.test(branch) && /createElement\('details'\)/.test(branch) && /chat-unknown-record/.test(branch));
  ok('the card is styled with theme vars', /\.chat-unknown-record \{[^}]*var\(--/.test(read('public/chat.css')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
