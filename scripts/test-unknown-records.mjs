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
  mm.processLive({ type: 'system', subtype: 'never_seen_a', branch: 'main', dirty: true });
  mm.processLive({ type: 'system', subtype: 'never_seen_b', url: 'https://example.invalid/x' });
  const c = cards(mm);
  ok('four records ⇒ four cards (no dedupe — the fall-back renders each one where it happened)', c.length === 4, c.map((m) => m.content[0].name));
  const b = c[0].content[0];
  ok('the block names kind + name + harness and carries the WHOLE record, pretty-printed (long strings intact)', b.type === 'unknown_record' && b.kind === 'type' && b.name === 'brand_new_record' && b.harness === 'Claude Code' && b.record.includes('a'.repeat(500)) && /\n  "payload": \{/.test(b.record), { name: b.name, len: b.record.length });
  ok('the second card is the second record (x: 2)', /"x": 2/.test(c[1].content[0].record));
  ok('a system one says system/<subtype>', c[2].content[0].kind === 'system' && c[2].content[0].name === 'never_seen_a' && /"branch": "main"/.test(c[2].content[0].record));
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
  const transcriptTypes = ['queue-operation', 'last-prompt', 'custom-title', 'agent-name', 'permission-mode', 'mode', 'atis-latch', 'file-history-snapshot', 'file-history-delta', 'cost-state', 'summary', 'progress'];
  const mm2 = createMessageManager('claude', 'test-unknown-3');
  mm2.convertHistory(transcriptTypes.map((type) => ({ type, uuid: 'u-' + type })));
  ok('the transcript\'s own bookkeeping rows never become cards on a rebuild (declared ignored)', cards(mm2).length === 0);
  mm2.convertHistory([{ type: 'pr-link', sessionId: 's', prNumber: 42, prUrl: 'https://example.invalid/o/r/pull/42', prRepository: 'o/r', timestamp: 't' }]);
  ok('…except pr-link, which is ROUTED since 2026-09-21: the same fact as code_change_published, ONE small card, never the red one', cards(mm2).length === 0 && mm2.messages.filter((m) => m.noticeKind === 'code-change-published').length === 1 && mm2.messages.find((m) => m.noticeKind === 'code-change-published').content[0].identifier === '42');
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
  ok('RUN_KINDS + SUMMARY_ORDER carry "unknown" ("{n} unknown events / new fields" — the §3 drift card shares the toggle)', RS.RUN_KINDS.includes('unknown') && RS.SUMMARY_ORDER.some(([k, key]) => k === 'unknown' && key === '{n} unknown events / new fields'));
  ok('messageKind classifies the §3 drift card as "unknown" too', RS.messageKind({ role: 'system', noticeKind: 'unknown-fields', content: [{ type: 'unknown_fields' }] }, { toolCard: false }) === 'unknown');
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

console.log('§6 the routed names (design-unknown-records, 2026-09-21): a routed name NO LONGER renders the red card — each has its own surface');
{
  const HAND = MM.HANDLED_SYSTEM_SUBTYPES, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES;
  ok('list pins: notification/local_command/away_summary/turn_duration/background_tasks_changed/task_updated/code_change_published are HANDLED; api_error/microcompact_boundary/vcs_state_changed are KNOWN_IGNORED (card-less by decision); background_tasks_changed/task_updated LEFT the ignored list; pr-link LEFT the ignored top-level list',
    ['notification', 'local_command', 'away_summary', 'turn_duration', 'background_tasks_changed', 'task_updated', 'code_change_published'].every((n) => HAND.has(n) && !IGN.has(n)) && ['api_error', 'microcompact_boundary', 'vcs_state_changed'].every((n) => IGN.has(n) && !HAND.has(n)) && !MM.KNOWN_IGNORED_RECORD_TYPES.has('pr-link'));
  const mm = createMessageManager('claude', 'test-routed-1');
  const ops = []; mm.listeners.push((e) => ops.push(e));
  const prevEv = global.__vsEvent; const names = []; global.__vsEvent = (n) => names.push(n);
  // notification: a priority-coloured notice, keyed dedupe per turn
  mm.processLive({ type: 'system', subtype: 'notification', key: 'stop-hook-error', text: 'Stop hook error occurred · ctrl+o to see', priority: 'immediate', uuid: 'n1', session_id: 's' });
  mm.processLive({ type: 'system', subtype: 'notification', key: 'stop-hook-error', text: 'Stop hook error occurred · ctrl+o to see', priority: 'immediate', uuid: 'n2', session_id: 's' });
  mm.processLive({ type: 'system', subtype: 'notification', key: 'memory-saved', text: 'Saved 2 memories', priority: 'low', uuid: 'n3', session_id: 's' });
  mm.processLive({ type: 'system', subtype: 'notification', text: 'no key at all', priority: 'weird', uuid: 'n4', session_id: 's' });
  let n = mm.messages.filter((m) => m.noticeKind === 'harness-notification');
  ok('notification ⇒ a harness-notification card per KEY per turn (the same key re-asserted in the same turn is one card), key-less ones always render, an unknown priority reads as medium', n.length === 3 && n[0].content[0].key === 'stop-hook-error' && n[0].content[0].priority === 'immediate' && n[1].content[0].key === 'memory-saved' && n[2].content[0].key === null && n[2].content[0].priority === 'medium', n.map((m) => m.content[0]));
  mm.processLive({ type: 'user', uuid: 'u1', session_id: 's', message: { role: 'user', content: 'next turn' }, promptSource: 'sdk' });
  mm.processLive({ type: 'system', subtype: 'notification', key: 'stop-hook-error', text: 'Stop hook error occurred · ctrl+o to see', priority: 'immediate', uuid: 'n5', session_id: 's' });
  ok('…the same key in the NEXT turn is news again (a second card)', mm.messages.filter((m) => m.noticeKind === 'harness-notification').length === 4);
  // local_command → the user-command bubble path (synthetic user, never a "You" bubble)
  const h = createMessageManager('claude', 'test-routed-2');
  h.convertHistory([{ type: 'system', subtype: 'local_command', content: '<command-name>/branch</command-name>\n<command-message>branch</command-message>\n<command-args>fix/x</command-args>', level: 'info', uuid: 'lc1', parentUuid: 'p', isSidechain: false, sessionId: 's', timestamp: '2026-09-01T00:00:00Z' }]);
  const lc = h.messages[0];
  ok('local_command ⇒ a synthetic USER message carrying the <command-name> text (renderUserMsg\'s notification path draws the /branch bubble), originKind local-command, no turn bump', h.messages.length === 1 && lc.role === 'user' && lc.synthetic === true && lc.originKind === 'local-command' && /<command-name>\/branch<\/command-name>/.test(lc.content[0].text) && h.turnIndex === 0);
  // away_summary → the recap card
  h.convertHistory([{ type: 'system', subtype: 'away_summary', content: 'Designed the canvas; **published**. Next: wire the toggle', uuid: 'as1', parentUuid: 'p', isSidechain: false, sessionId: 's', timestamp: '2026-09-01T00:01:00Z' }]);
  ok('away_summary ⇒ ONE away-summary card carrying the model text (markdown on the client)', h.messages.filter((m) => m.noticeKind === 'away-summary').length === 1 && /published/.test(h.messages.find((m) => m.noticeKind === 'away-summary').content[0].text));
  // turn_duration → the turn's last message meta
  const td = createMessageManager('claude', 'test-routed-3');
  const tops = []; td.listeners.push((e) => tops.push(e));
  td.processLive({ type: 'user', uuid: 'tu1', session_id: 's', message: { role: 'user', content: 'go' }, promptSource: 'sdk' });
  td.processLive({ type: 'assistant', uuid: 'ta1', session_id: 's', message: { id: 'msg_t1', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 1, output_tokens: 1 } } });
  td.processLive({ type: 'result', subtype: 'success', uuid: 'tr1', session_id: 's', duration_ms: 5, is_error: false, result: 'done' });
  td.processLive({ type: 'system', subtype: 'turn_duration', duration_ms: 198441, message_count: 66, budget_tokens: 12000, budget_limit: 50000, uuid: 'td1', session_id: 's' });
  const last = td.messages.filter((m) => m.role === 'assistant').pop();
  ok('turn_duration (stream, snake_case) ⇒ merged into the turn\'s last message meta {durationMs, messageCount, budgetTokens, budgetLimit} through an EDIT op; no card', last?.meta?.turn?.durationMs === 198441 && last.meta.turn.messageCount === 66 && last.meta.turn.budgetLimit === 50000 && tops.some((o) => o.op === 'edit' && o.id === last.id && o.fields.meta?.turn?.messageCount === 66) && !td.messages.some((m) => m.noticeKind === 'unknown-record'), last?.meta);
  const td2 = createMessageManager('claude', 'test-routed-4');
  td2.convertHistory([{ type: 'user', uuid: 'hu1', parentUuid: null, isSidechain: false, sessionId: 's', message: { role: 'user', content: 'go' } }, { type: 'assistant', uuid: 'ha1', parentUuid: 'hu1', isSidechain: false, sessionId: 's', message: { id: 'msg_h1', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'ok' }] } }, { type: 'system', subtype: 'turn_duration', durationMs: 4200, messageCount: 3, parentUuid: 'ha1', isSidechain: false, sessionId: 's', uuid: 'htd' }]);
  ok('…the transcript twin (camelCase) lands the same way on a rebuild', td2.messages.filter((m) => m.role === 'assistant').pop()?.meta?.turn?.durationMs === 4200);
  // api_error / microcompact_boundary / vcs_state_changed: card-less BY DECISION
  const ig = createMessageManager('claude', 'test-routed-5');
  ig.convertHistory([{ type: 'system', subtype: 'api_error', error: { status: 529 }, retryInMs: 1, uuid: 'ae', parentUuid: 'p', isSidechain: false, sessionId: 's' }, { type: 'system', subtype: 'microcompact_boundary', uuid: 'mc', parentUuid: 'p', isSidechain: false, sessionId: 's' }]);
  ig.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'push', branch: 'main', cwd: '/w/proj', uuid: 'vc', session_id: 's' });
  ok('api_error (transcript) / microcompact_boundary / vcs_state_changed ⇒ NO card of any kind (declared card-less; the server consumer owns vcs, the 401/403 side effect)', ig.messages.length === 0);
  // background_tasks_changed: the LEVEL signal over BACKGROUND tasks — a SOFT close (finished, closedBy level) of a backgrounded task the set no longer names + a meta op
  const bg = createMessageManager('claude', 'test-routed-6');
  const bops = []; bg.listeners.push((e) => bops.push(e));
  bg.processLive({ type: 'assistant', uuid: 'ba1', session_id: 's', message: { id: 'msg_b1', role: 'assistant', model: 'm', content: [{ type: 'tool_use', id: 'toolu_bg1', name: 'Agent', input: { description: 'one' } }, { type: 'tool_use', id: 'toolu_bg2', name: 'Agent', input: { description: 'two' } }] } });
  bg.processLive({ type: 'system', subtype: 'task_started', task_id: 't-one', tool_use_id: 'toolu_bg1', description: 'one', task_type: 'local_agent', is_backgrounded: true, uuid: 'bs1', session_id: 's' });
  bg.processLive({ type: 'system', subtype: 'task_started', task_id: 't-two', tool_use_id: 'toolu_bg2', description: 'two', task_type: 'local_agent', is_backgrounded: true, uuid: 'bs2', session_id: 's' });
  bg.processLive({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 't-two', task_type: 'local_agent', description: 'two' }], uuid: 'bt1', session_id: 's' });
  const one = bg.messages.find((m) => m.toolCallId === 'toolu_bg1'), two = bg.messages.find((m) => m.toolCallId === 'toolu_bg2');
  ok('background_tasks_changed (the full live set names only t-two) ⇒ t-one\'s card is SOFT-closed (status finished, closedBy level — the set dropped it, no outcome record), t-two stays running, ONE meta op background-tasks with the set, no card', one?.taskInfo?.status === 'finished' && one.taskInfo.closedBy === 'level' && one.taskInfo.backgrounded === true && two?.taskInfo?.status === 'running' && bops.some((o) => o.op === 'edit' && o.id === one.id && o.fields.taskInfo.status === 'finished') && bops.some((o) => o.op === 'meta' && o.subtype === 'background-tasks' && o.data.tasks.length === 1 && o.data.tasks[0].id === 't-two') && !bg.messages.some((m) => m.role === 'system') && JSON.stringify(bg.backgroundTasks()) === JSON.stringify([{ id: 't-two', type: 'agent', description: 'two' }]) /* 2.369.139: the level set carries OUR type word (normalizeTaskType), the same the cards and the status bar compare */, { one: one?.taskInfo, two: two?.taskInfo });
  bg.processLive({ type: 'system', subtype: 'task_updated', task_id: 't-two', patch: { status: 'failed', end_time: 1 }, uuid: 'tu1', session_id: 's' });
  ok('task_updated {patch:{status:failed}} ⇒ the task card closes as failed without waiting for task_notification (closedBy task_updated)', two.taskInfo.status === 'failed' && two.taskInfo.closedBy === 'task_updated');
  // NEGATIVE (r3 2026-09-21, reproduced on the production buffers: 86 of 107 task_started were local_bash is_backgrounded:false and 5 of them
  // saw a set WITHOUT their id while still running): a FOREGROUND task is never a member of the level set — it stays running
  const fg = createMessageManager('claude', 'test-routed-6fg');
  const fops = []; fg.listeners.push((e) => fops.push(e));
  fg.processLive({ type: 'assistant', uuid: 'fa1', session_id: 's', message: { id: 'msg_f1', role: 'assistant', model: 'm', content: [{ type: 'tool_use', id: 'toolu_fg', name: 'Bash', input: { command: 'npm test', description: 'run the suite' } }] } });
  fg.processLive({ type: 'system', subtype: 'task_started', task_id: 'bfg1', tool_use_id: 'toolu_fg', description: 'run the suite', task_type: 'local_bash', is_backgrounded: false, uuid: 'fs1', session_id: 's' });
  const fgBefore = fops.length;
  fg.processLive({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'bother', task_type: 'local_agent', description: 'other' }], uuid: 'ft1', session_id: 's' });
  const fgCard = fg.messages.find((m) => m.toolCallId === 'toolu_fg');
  ok('a running FOREGROUND Bash (task_started is_backgrounded:false) absent from background_tasks_changed STAYS running (backgrounded false, no taskInfo edit op from the set) — the set never names foreground calls', fgCard?.taskInfo?.status === 'running' && fgCard.taskInfo.backgrounded === false && !fops.slice(fgBefore).some((o) => o.op === 'edit' && o.id === fgCard.id && o.fields.taskInfo), fgCard?.taskInfo);
  fg.processLive({ type: 'system', subtype: 'task_started', task_id: 'bnf', tool_use_id: 'toolu_nf', description: 'no flag', task_type: 'local_bash', uuid: 'fs2', session_id: 's' });
  ok('…a task_started WITHOUT the is_backgrounded flag reads as foreground too (never assumed background)', fg.messages.find((m) => m.toolCallId === 'toolu_nf') === undefined || fg.messages.find((m) => m.toolCallId === 'toolu_nf').taskInfo?.backgrounded === false);
  // the outcome record after the set dropped the task (every observed task_updated{failed} came AFTER the set-removal — the old hard close pre-empted them all)
  const late = (tag, outcome) => {
    const m = createMessageManager('claude', 'test-routed-6' + tag);
    m.processLive({ type: 'assistant', uuid: 'la1', session_id: 's', message: { id: 'msg_l1', role: 'assistant', model: 'm', content: [{ type: 'tool_use', id: 'toolu_l', name: 'Agent', input: { description: 'late' } }] } });
    m.processLive({ type: 'system', subtype: 'task_started', task_id: 'tl', tool_use_id: 'toolu_l', description: 'late', task_type: 'local_agent', is_backgrounded: true, uuid: 'ls1', session_id: 's' });
    m.processLive({ type: 'system', subtype: 'background_tasks_changed', tasks: [], uuid: 'lt1', session_id: 's' });
    const card = m.messages.find((mm) => mm.toolCallId === 'toolu_l');
    const soft = card?.taskInfo?.status === 'finished' && card.taskInfo.closedBy === 'level';
    outcome(m);
    return { soft, ti: card?.taskInfo };
  };
  const r1 = late('a', (m) => m.processLive({ type: 'system', subtype: 'task_updated', task_id: 'tl', patch: { status: 'failed', end_time: 1 }, uuid: 'lu1', session_id: 's' }));
  ok('set-removal (soft finished) THEN task_updated{failed} ⇒ ends as FAILED (closedBy task_updated) — the harness\'s verdict overwrites the level guess', r1.soft && r1.ti.status === 'failed' && r1.ti.closedBy === 'task_updated', r1);
  const r2 = late('b', (m) => m.processLive({ type: 'system', subtype: 'task_notification', task_id: 'tl', tool_use_id: 'toolu_l', status: 'completed', summary: 'done', uuid: 'ln1', session_id: 's' }));
  ok('set-removal THEN stdout task_notification{status:completed} ⇒ completed (closedBy notification)', r2.soft && r2.ti.status === 'completed' && r2.ti.closedBy === 'notification', r2);
  const r3 = late('c', (m) => m.processLive({ type: 'system', subtype: 'task_notification', task_id: 'tl', tool_use_id: 'toolu_l', status: 'killed', uuid: 'ln2', session_id: 's' }));
  ok('…task_notification{status:killed} (a declared terminal value) ⇒ killed, not completed', r3.soft && r3.ti.status === 'killed', r3);
  const r4 = late('d', (m) => m.processLive({ type: 'queue-operation', content: '<task-notification>\n<task-id>tl</task-id>\n<tool-use-id>toolu_l</tool-use-id>\n<status>failed</status>\n<summary>boom</summary>\n</task-notification>', uuid: 'lq1', session_id: 's' }));
  ok('…the <task-notification> user-record twin after a set-removal ⇒ failed too (summary kept)', r4.soft && r4.ti.status === 'failed' && r4.ti.summary === 'boom', r4);
  const r5 = late('e', (m) => { m.processLive({ type: 'system', subtype: 'task_notification', task_id: 'tl', tool_use_id: 'toolu_l', status: 'failed', uuid: 'ln3', session_id: 's' }); m.processLive({ type: 'system', subtype: 'background_tasks_changed', tasks: [], uuid: 'lt2', session_id: 's' }); });
  ok('a REAL outcome is never downgraded by a later level set (failed stays failed)', r5.ti.status === 'failed', r5);
  // the launch-ack synthesis (history + live) marks the task backgrounded: the ack text itself says "in background"
  const ack = createMessageManager('claude', 'test-routed-6ack');
  ack.convertHistory([
    { type: 'user', uuid: 'ku1', parentUuid: null, isSidechain: false, sessionId: 's', message: { role: 'user', content: 'go' } },
    { type: 'assistant', uuid: 'ka1', parentUuid: 'ku1', isSidechain: false, sessionId: 's', message: { id: 'msg_k1', role: 'assistant', model: 'm', content: [{ type: 'tool_use', id: 'toolu_k', name: 'Agent', input: { description: 'bg agent', run_in_background: true } }] } },
    { type: 'user', uuid: 'ku2', parentUuid: 'ka1', isSidechain: false, sessionId: 's', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_k', content: 'Async agent launched successfully.\nagentId: abc123\noutput_file: /w/o' }] } },
  ]);
  const ackCard = ack.messages.find((m) => m.toolCallId === 'toolu_k');
  ok('a HISTORY launch ack ("Async agent launched") synthesizes taskInfo with backgrounded:true (a member of the level set on a rebuilt view)', ackCard?.taskInfo?.status === 'running' && ackCard.taskInfo.backgrounded === true, ackCard?.taskInfo);
  const old = createMessageManager('claude', 'test-routed-6old');
  old.processLive({ type: 'assistant', uuid: 'oa1', session_id: 's', message: { id: 'msg_o1', role: 'assistant', model: 'm', content: [{ type: 'tool_use', id: 'toolu_o', name: 'Agent', input: { description: 'old cli' } }] } });
  old.processLive({ type: 'system', subtype: 'task_started', task_id: 'to', tool_use_id: 'toolu_o', description: 'old cli', task_type: 'local_agent', uuid: 'os1', session_id: 's' });
  old.processLive({ type: 'user', uuid: 'ou1', session_id: 's', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_o', content: 'Async agent launched successfully.\nagentId: to\noutput_file: /w/o' }] } });
  ok('LIVE ORDER: a task_started lacking the flag (older CLI) followed by the background ack ⇒ backgrounded:true', old.messages.find((m) => m.toolCallId === 'toolu_o')?.taskInfo?.backgrounded === true);
  // the client half is source-pinned (chat-status-bar / chat-renderers / chat-view are DOM modules): ONE owner of the close, the tail patched by a later verdict, `finished` drawn neutral
  const sb = read('src/lib/chat-status-bar.js');
  const sbBody = sb.slice(sb.indexOf('setBackgroundTasks(list) {'), sb.indexOf('addCost(cost'));
  ok('chat-status-bar.setBackgroundTasks closes NOTHING (no updateTask call — the normalizer is the reconcile\'s one owner); updateTask patches a done-tail row by toolCallId when the real outcome lands after the soft close; the tail draws `finished` as ○ (tdone-soft), never ✗', !/updateTask\(/.test(sbBody) && /this\._doneTasks\?\.find\(\(r\) => r\.toolCallId === toolCallId\)/.test(sb) && /tdone-soft/.test(sb) && /dt\.status === 'finished'/.test(sb));
  const cr = read('src/lib/chat-renderers.js');
  ok('chat-renderers.taskStatusChipHtml: `finished` is the soft chip (class soft, never err); Agent AND Workflow cards use the ONE helper; chat-view\'s _freezeAgentStatus words finished like completed', /ti\.status === 'finished'\) return ` <span class="chat-task-status-chip soft"/.test(cr) && /const taskStatusChipHtml = \(ti\) =>/.test(cr) && (cr.match(/taskStatusChipHtml\(/g) || []).length === 2 && /status === 'completed' \|\| status === 'finished' \? t\('finished'\)/.test(read('src/lib/chat-view.js')) && /\.chat-task-status-chip\.soft \{ color: var\(--text-dim\)/.test(read('public/chat.css')));
  // code_change_published: ONE card per url, edited in place, unified with pr-link
  const cc = createMessageManager('claude', 'test-routed-7');
  const cops = []; cc.listeners.push((e) => cops.push(e));
  cc.processLive({ type: 'system', subtype: 'code_change_published', provider: 'github', url: 'https://example.invalid/o/r/pull/608', repo: 'o/r', identifier: '608', action: 'pushed', uuid: 'cc1', session_id: 's' });
  cc.processLive({ type: 'pr-link', sessionId: 's', prNumber: 608, prUrl: 'https://example.invalid/o/r/pull/608', prRepository: 'o/r', timestamp: 't' });
  cc.processLive({ type: 'system', subtype: 'code_change_published', provider: 'github', url: 'https://example.invalid/o/r/pull/608', repo: 'o/r', identifier: '608', action: 'merged', uuid: 'cc2', session_id: 's' });
  cc.processLive({ type: 'system', subtype: 'code_change_published', provider: 'github', url: 'javascript:alert(1)', repo: 'o/r', identifier: '609', action: 'pushed', uuid: 'cc3', session_id: 's' });
  const pr = cc.messages.filter((m) => m.noticeKind === 'code-change-published');
  ok('code_change_published ⇒ ONE code-change card per url (the pr-link row of the same url adds none; a later action EDITS it to merged); a non-http url yields a card with NO link', pr.length === 2 && pr[0].content[0].identifier === '608' && pr[0].content[0].action === 'merged' && cops.some((o) => o.op === 'edit' && o.id === pr[0].id) && pr[1].content[0].url === null && pr[1].content[0].identifier === '609', pr.map((m) => m.content[0]));
  cc.processLive({ type: 'system', subtype: 'code_change_published', provider: 'github', repo: 'o/r', identifier: '609', action: 'merged', uuid: 'cc4', session_id: 's' });
  cc.processLive({ type: 'system', subtype: 'code_change_published', identifier: '42', action: 'pushed', uuid: 'cc5', session_id: 's' });
  cc.processLive({ type: 'system', subtype: 'code_change_published', identifier: '42', action: 'pushed', uuid: 'cc6', session_id: 's' });
  const pr2 = cc.messages.filter((m) => m.noticeKind === 'code-change-published');
  ok('url-less dedupe is repo#identifier (o/r#609 edits the existing card to merged); a row with NEITHER url nor repo is never deduped (two "#42" rows from unknown repos = two cards, never a "null#42" key)', pr2.length === 4 && pr2[1].content[0].action === 'merged' && pr2[2].content[0].identifier === '42' && pr2[3].content[0].identifier === '42', pr2.map((m) => m.content[0]));
  ok('none of the routed names fired the red card', ![mm, h, td, td2, ig, bg, cc].some((x) => cards(x).length));
  global.__vsEvent = prevEv;
}

console.log('§7 codex: item_completed McpToolCall is THE MCP tool card; the wrapper\'s _stdin_ack is skipped');
{
  const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
  const prevEv = global.__vsEvent; const names = []; global.__vsEvent = (n) => names.push(n);
  const lines = read('scripts/fixtures/unknown-records/codex-rollout.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const cx = createMessageManager('codex', 'test-routed-cx');
  cx.convertHistory(lines);
  const tools = cx.messages.filter((m) => m.role === 'tool');
  ok('the real (redacted) McpToolCall item ⇒ a tool card: toolName mcp__<server>__<tool> (the renderer\'s mcpParts draws "tool (server)"), collapseKind mcp, the arguments as input, the result content as output, complete', tools.length === 2 && tools[0].toolName === 'mcp__example-mcp__execute_code' && tools[0].collapseKind === 'mcp' && tools[0].status === 'complete' && tools[0].content[0].type === 'tool_result' && /print\(json\.dumps/.test(tools[0].content[0].input.code) && /"status": "ok"/.test(tools[0].content[0].output), tools.map((m) => [m.toolName, m.status, m.collapseKind]));
  ok('…a failed one (status failed / result.isError) is an error card', tools[1].toolName === 'mcp__example-mcp__read_state' && tools[1].status === 'error' && /connection refused/.test(tools[1].content[0].output));
  ok('the wrapper\'s _stdin_ack record is SKIPPED (declared): no card, no telemetry', CodexMessageManager.SKIPPED_RECORD_TYPES.has('_stdin_ack') && !names.some((x) => /_stdin_ack/.test(x)));
  ok('no red card and no unknown-record telemetry for the whole fixture rollout', cards(cx).length === 0 && !names.some((x) => /codex-unknown-record/.test(x)), names);
  global.__vsEvent = prevEv;
}

console.log('§8 the renderers for the routed names escape every harness string and never auto-open a url');
{
  const cr = read('src/lib/chat-renderers.js');
  const branch = (kind) => { const i = cr.indexOf(`noticeKind === '${kind}'`); return i >= 0 ? cr.slice(i, i + 2200) : ''; };
  ok("harness-notification: a stop-hook-error notice is a HOOK card (chat.showHookCards covers it) AND the stop-hook notice (chat.showStopHookErrorNotice, off by default hides it via body.hide-stop-hook-notice)", /b\.key === 'stop-hook-error'\) el\.classList\.add\('chat-msg-hook', 'chat-stop-hook-notice'\)/.test(branch('harness-notification')) && /body\.hide-stop-hook-notice \.chat-stop-hook-notice \{ display: none; \}/.test(fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8')) && /hide-stop-hook-notice/.test(fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8')) && /stopNoticeHidden && el\.classList\.contains\('chat-stop-hook-notice'\)/.test(fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8')));
  ok('harness-notification: the text is escaped, priority classes carry the colour, the icon is SVG (UI_ICONS)', /escHtml\(b\.text \|\| ''\)/.test(branch('harness-notification')) && /chat-harness-notice-\$\{pri\}/.test(branch('harness-notification')) && /UI_ICONS\.alert/.test(branch('harness-notification')));
  ok('away-summary: the model text goes through renderMarkdown (marked + DOMPurify), never innerHTML raw', /this\.renderMarkdown\(msg\.content\[0\]\.text\)/.test(branch('away-summary')));
  ok('code-change-published: the link is href-escaped, http(s)-only, rel="noopener noreferrer", and nothing calls window.open', /href="\$\{escHtml\(b\.url\)\}" target="_blank" rel="noopener noreferrer"/.test(branch('code-change-published')) && /\^https\?:\\\/\\\//.test(branch('code-change-published')) && !/window\.open/.test(branch('code-change-published')));
  const css = read('public/chat.css');
  ok('the notice colours are theme vars (immediate = --red, high = --yellow)', /\.chat-harness-notice-immediate \{[^}]*var\(--red/.test(css) && /\.chat-harness-notice-high \{[^}]*var\(--yellow\)/.test(css));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
