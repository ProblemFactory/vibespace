#!/usr/bin/env node
// UNKNOWN EVENTS ARE THE FALL-BACK CARD (2.369.119/.120, owner: "你对于未知的 event 似乎是
// 直接过滤掉…提醒我 harness 可能加了新功能" → "未知事件就正常放在对话流里不用特别处理，作为兜底";
// "展开可以看到这个 event 的所有信息" / "放进可统一折叠的选项里，默认不选" / "红色边框"). A record
// type or system subtype the normalizer does not handle — and that is not on its
// DECLARED known-ignored lists (records the server consumer or the transcript
// bookkeeping own) — becomes an "Unknown event" card in the flow, history and
// live alike, carrying the whole record; the run-fold owns its noise through
// the 'unknown' kind (off by default). rate_limit_event (2.289.0), tool_progress
// (2.227.7) and model_refusal_fallback (2.227.4) were each an invisible gap for
// weeks; this makes the next one visible in the chat itself.
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

console.log('§1 claude: EVERY unknown record is a card in the flow — top-level types and system subtypes, live');
{
  const mm = createMessageManager('claude', 'test-unknown-1');
  const ops = []; mm.listeners.push((e) => ops.push(e));
  mm.processLive({ type: 'brand_new_record', payload: { x: 1, long: 'a'.repeat(500) } });
  mm.processLive({ type: 'brand_new_record', payload: { x: 2 } });
  mm.processLive({ type: 'system', subtype: 'vcs_state_changed', branch: 'main', dirty: true });
  mm.processLive({ type: 'system', subtype: 'code_change_published', url: 'https://example.invalid/x' });
  const c = cards(mm);
  ok('four records ⇒ four cards (no dedupe — the fall-back renders each one where it happened)', c.length === 4, c.map((m) => m.content[0].name));
  const b = c[0].content[0];
  ok('the block names kind + name + harness and carries the WHOLE record, pretty-printed (long strings intact)', b.type === 'unknown_record' && b.kind === 'type' && b.name === 'brand_new_record' && b.harness === 'Claude Code' && b.record.includes('a'.repeat(500)) && /\n  "payload": \{/.test(b.record), { name: b.name, len: b.record.length });
  ok('the second card is the second record (x: 2)', /"x": 2/.test(c[1].content[0].record));
  ok('a system one says system/<subtype>', c[2].content[0].kind === 'system' && c[2].content[0].name === 'vcs_state_changed' && /"branch": "main"/.test(c[2].content[0].record));
  ok('live cards are EMITTED as create ops (an open window sees them)', ops.filter((o) => o.op === 'create' && o.msg && o.msg.noticeKind === 'unknown-record').length === 4);
  const big = createMessageManager('claude', 'test-unknown-big');
  big.processLive({ type: 'huge_record', blob: 'z'.repeat(200000) });
  ok('a pathological record is truncated at 64 KB with a marker', cards(big)[0].content[0].record.length < 70000 && /truncated at 64 KB/.test(cards(big)[0].content[0].record));
}

console.log('§2 history renders the same cards (the fall-back is a renderer, not an alert); handled / known-ignored never do');
{
  const mm = createMessageManager('claude', 'test-unknown-2');
  for (const type of MM.KNOWN_IGNORED_RECORD_TYPES) mm.processLive({ type, anything: 1 });
  for (const sub of MM.HANDLED_SYSTEM_SUBTYPES) mm.processLive({ type: 'system', subtype: sub });
  for (const sub of MM.KNOWN_IGNORED_SYSTEM_SUBTYPES) mm.processLive({ type: 'system', subtype: sub });
  mm.processLive({ type: 'system', subtype: 'task_progress', tool_use_id: 'toolu_none', task_id: 't1' }); // task_* under a tool_use_id never trips it
  ok(`no card for any handled (${MM.HANDLED_SYSTEM_SUBTYPES.size}) / known-ignored subtype (${MM.KNOWN_IGNORED_SYSTEM_SUBTYPES.size}) / known-ignored top-level type (${MM.KNOWN_IGNORED_RECORD_TYPES.size})`, cards(mm).length === 0, cards(mm).map((m) => m.content[0].name));
  const consumer = read('src/server/stdout/claude-stream-json.js');
  const consumerTypes = [...consumer.matchAll(/msg\.type === '([a-z_]+)'/g)].map((m) => m[1]).filter((t) => !['system', 'assistant', 'user', 'result', 'control_response', 'attachment'].includes(t));
  const missing = consumerTypes.filter((t) => !MM.KNOWN_IGNORED_RECORD_TYPES.has(t));
  ok(`every top-level type the SERVER consumer handles is on the normalizer's known-ignored list (${consumerTypes.length} checked)`, missing.length === 0, missing);
  const transcriptTypes = ['queue-operation', 'last-prompt', 'custom-title', 'agent-name', 'permission-mode', 'mode', 'pr-link', 'atis-latch', 'file-history-snapshot', 'file-history-delta', 'cost-state', 'summary', 'progress'];
  const mm2 = createMessageManager('claude', 'test-unknown-3');
  mm2.convertHistory(transcriptTypes.map((type) => ({ type, uuid: 'u-' + type })));
  ok('the transcript\'s own bookkeeping rows never become cards on a rebuild (declared ignored)', cards(mm2).length === 0);
  const mm3 = createMessageManager('claude', 'test-unknown-4');
  mm3.convertHistory([{ type: 'never_seen_before', uuid: 'u1' }, { type: 'system', subtype: 'never_seen_subtype', uuid: 'u2' }]);
  ok('…while a truly unknown record in HISTORY renders as a card too (same cards live and rebuilt — the fall-back is consistent)', cards(mm3).length === 2);
}

console.log('§3 codex: an unknown record becomes a card too');
{
  const mm = createMessageManager('codex', 'test-unknown-codex');
  const ops = []; mm.listeners.push((e) => ops.push(e));
  mm.processLive({ type: 'totally_new_codex_record', foo: 'bar' });
  mm.processLive({ type: 'totally_new_codex_record', foo: 'baz' });
  const c = cards(mm);
  ok('one card per unknown codex record, harness named, whole record', c.length === 2 && c[0].content[0].harness === 'Codex' && /totally_new_codex_record/.test(c[0].content[0].name) && /"foo": "baz"/.test(c[1].content[0].record), c.map((m) => m.content[0].name));
}

console.log('§4 the fold owns the noise: kind "unknown", its own toggle, OFF by default');
{
  const RS = await import(path.join(REPO, 'src/lib/chat-run-summary.js'));
  ok('RUN_KINDS + SUMMARY_ORDER carry "unknown" ("{n} unknown events")', RS.RUN_KINDS.includes('unknown') && RS.SUMMARY_ORDER.some(([k, key]) => k === 'unknown' && key === '{n} unknown events'));
  ok('messageKind classifies an unknown-event card as "unknown" (and a plain system card still as null)', RS.messageKind({ role: 'system', noticeKind: 'unknown-record', content: [{ type: 'unknown_record' }] }, { toolCard: false }) === 'unknown' && RS.messageKind({ role: 'system', content: [{ type: 'system_info', text: 'x' }] }, { toolCard: false }) === null);
  ok('foldToggleFor("unknown") is its own toggle', RS.foldToggleFor('unknown') === 'unknown');
  const schema = read('src/lib/settings-schema.js');
  const defaults = /'chat\.collapseKinds':[\s\S]{0,600}?default: \[([^\]]*)\]/.exec(schema)?.[1] || '';
  ok('chat.collapseKinds offers "unknown" and does NOT tick it by default', /value: 'unknown'/.test(schema) && !/'unknown'/.test(defaults), defaults);
}

console.log('§5 the renderer: a red-bordered "Unknown event" card, everything escaped, the whole record folded');
{
  const cr = read('src/lib/chat-renderers.js');
  const i = cr.indexOf("noticeKind === 'unknown-record'");
  const branch = cr.slice(i, i + 2500);
  ok('renderSystemMsg branch: title + harness + name escaped, the record behind a <details> in a <pre>, class chat-unknown-event', /escHtml\(b\.name\)/.test(branch) && /escHtml\(b\.harness/.test(branch) && /escHtml\(b\.record\)/.test(branch) && /createElement\('details'\)/.test(branch) && /chat-unknown-event/.test(branch) && /t\('Unknown event'\)/.test(branch));
  const css = read('public/chat.css');
  ok('the card wears a red border from the theme var (no literal-only colour), radius token, bounded scroll for the record', /\.chat-unknown-event \{[^}]*border: 1px solid var\(--red/.test(css) && /border-radius: var\(--radius\)/.test(css.slice(css.indexOf('.chat-unknown-event {'))) && /\.chat-unknown-event \.chat-pre \{[^}]*max-height/.test(css));
  ok('no leftover of the 2.369.119 sample-only card', !/unknownSample/.test(read('src/message-manager.js')) && !/unknownSample/.test(read('src/codex-message-manager.js')) && !/chat-unknown-record/.test(cr));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
