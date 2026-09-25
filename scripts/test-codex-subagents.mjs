#!/usr/bin/env node
// Codex sub-agent VISIBILITY — renderer + click-through + roster route (B-7473).
//
// Owner report (2026-09-06, a real 0.153.4 root window, 12 sub-agents): a
// sub-agent's report ("已完成，仅修改约定两文件：…") appeared as an ORDINARY
// assistant message, some of them twice, and "根本没区分出这是subagent消息".
// The normalizer half is pinned in test-codex-0153 ⑥ / test-codex-p2-wrapper ④;
// this suite covers what the USER sees and clicks:
//   ① the PURE row builder — labels, coalescing, the encrypted note, and the
//      XSS rule made VERIFIABLE (a marker escaper proves every model-controlled
//      string leaves through esc; a faithful escaper proves nothing survives)
//   ② the renderer + chat-view wiring (report card, click delegation, the fold
//      summary's "N sub-agent messages" / "N sub-agents" chips, CSS)
//   ③ GET /api/subagents against a REAL express mount over a temp CODEX_HOME
//      holding real-shaped parent + child rollout heads
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fixtureSid, scratchHome } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

// THIS PROCESS IS RE-HOMED before any fixture exists (test-fixture-isolation
// (c): ④ mints fixtureSid() ids, so the suite isolates its own process — the
// test-fork-groups shape): HOME and os.homedir point at a scratch home, every
// scratch home this suite makes is cleaned on exit AND on signals, and the
// real ~/.claude/projects is censused at the end. Every child still gets an
// explicit HOME of its own scratch store.
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = require(path.join(REPO, 'src/fixture-guard.js'));
const fakeHome = scratchHome('codex-subagents-self', fs);
const scratchHomes = [fakeHome];
const cleanupHomes = () => { for (const h of scratchHomes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanupHomes);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanupHomes(); process.exit(143); });
process.env.HOME = fakeHome;
os.homedir = () => fakeHome;
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const CR = require(path.join(REPO, 'src/collab-row.js'));
// byte-identical to src/lib/utils.js escHtml (the escaper the renderer injects)
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);

console.log('— ① the PURE row builder (labels, coalescing, escaping)');
{
  const IN = { dir: 'in', agentPath: '/root/water_research', agentName: 'water_research', msgType: 'FINAL_ANSWER', encrypted: false, threadId: '01a07340-6597-74f2-882c-f7092fecd5a0' };
  const OUT = { dir: 'out', agentPath: '/root/interior_research', agentName: 'interior_research', target: '/root/interior_research', msgType: 'message', encrypted: true };
  const SPAWN = { dir: 'spawn', agentPath: '/root/water_research', agentName: 'water_research', encrypted: true, detail: 'research the water system' };
  const WAIT = { dir: 'wait', cellId: '3', yieldMs: 1000 };
  const ACT = { dir: 'activity', agentPath: '/root/water_research', agentName: 'water_research', kind: 'started', threadId: 'th-child' };
  ok(CR.collabRowLabel(IN) === 'water_research · FINAL_ANSWER', 'inbound label names the agent and the message type', CR.collabRowLabel(IN));
  ok(CR.collabRowLabel(OUT) === 'interior_research · message', 'outbound label', CR.collabRowLabel(OUT));
  ok(CR.collabRowLabel(SPAWN) === 'spawn water_research' && CR.collabRowLabel(WAIT) === 'waiting for sub-agent replies · cell 3 · ≤1s' && CR.collabRowLabel(ACT) === 'water_research started', 'spawn / wait / lifecycle labels', [CR.collabRowLabel(SPAWN), CR.collabRowLabel(WAIT), CR.collabRowLabel(ACT)].join(' | '));
  ok(CR.agentName('/root/water_research') === 'water_research' && CR.agentName('') === '' && CR.agentName('th-1') === 'th-1', 'agentName is the last path segment, thread ids pass through');
  const many = { rows: [IN, { ...IN, agentPath: '/root/energy_research', agentName: 'energy_research', msgType: 'MESSAGE' }, { ...IN, agentPath: '/root/interior_research', agentName: 'interior_research', msgType: 'MESSAGE' }] };
  ok(CR.collabSummaryText(many) === 'Sub-agent traffic · 3 messages · 3 agents · water_research (FINAL_ANSWER), energy_research (MESSAGE), interior_research (MESSAGE)', 'coalesced summary counts and names (the {n} param is substituted even without a client t())', CR.collabSummaryText(many));
  ok(/^Sub-agent traffic · 4 sub-agent events · 2 agents · /.test(CR.collabSummaryText({ rows: [IN, OUT, SPAWN, ACT] })), 'a MIXED coalesced set reads as sub-agent events (never "messages") and counts DISTINCT agents', CR.collabSummaryText({ rows: [IN, OUT, SPAWN, ACT] }));
  ok(CR.collabReportHeadText({ rows: [IN] }) === 'water_research · FINAL_ANSWER', 'the report attribution header is "<agent> · <TYPE>"', CR.collabReportHeadText({ rows: [IN] }));
  const title = CR.collabRowTitle(OUT);
  ok(/Sender: \/root\/interior_research/.test(title) && /Message type: message/.test(title) && /payload encrypted upstream/.test(title), 'the hover title carries the envelope + the honest encryption note', title);
  ok(!/payload encrypted upstream/.test(CR.collabRowTitle(IN)), '…and says nothing about encryption for a plaintext row');

  // XSS: EVERY model-controlled field must leave through the injected escaper.
  const HOSTILE = {
    dir: 'in',
    agentPath: '/root/<img src=x onerror=alert(1)>',
    agentName: '<img src=x onerror=alert(1)>',
    nickname: '"><script>alert(2)</script>',
    msgType: '<svg/onload=alert(3)>',
    target: "'-alert(4)-'",
    detail: '<b>detail</b>',
    threadId: '"><script>alert(5)</script>',
    encrypted: true,
  };
  const marks = [];
  const markerEsc = (s) => { marks.push(String(s ?? '')); return '\u0001' + String(s ?? '') + '\u0002'; };
  const marked = CR.collabRowHtml(HOSTILE, { esc: markerEsc, icons: {} });
  const raw = marked.replace(/\u0001[^\u0002]*\u0002/g, '');
  ok(!/<img|<script|<svg|onerror|onload/.test(raw), 'every hostile field is interpolated ONLY through the injected escaper (marker proof)', raw.slice(0, 160));
  ok(marks.includes(HOSTILE.agentName) && marks.includes(HOSTILE.threadId) && marks.some((m) => m.includes(HOSTILE.msgType)), 'the agent name, the thread id and the message type all pass through esc', JSON.stringify(marks.slice(0, 4)));
  const real = CR.collabRowHtml(HOSTILE, { esc: escHtml, icons: { in: '<svg class="i"></svg>' } });
  // (an escaped `onerror=` inside text/attribute VALUES is inert — what must
  // never appear is an unescaped tag opening or a bare quote breaking out)
  ok(!/<img|<script|<svg\/|'-alert/.test(real) && /&lt;img src=x onerror=alert\(1\)&gt;/.test(real) && /&lt;svg\/onload=alert\(3\)&gt;/.test(real), 'with the real escaper nothing executable survives (name, type, title)', real.slice(0, 200));
  ok(/data-agent-path="\/root\/&lt;img src=x onerror=alert\(1\)&gt;"/.test(real) && /data-thread-id="&quot;&gt;&lt;script&gt;/.test(real), 'the click-through data attributes are escaped too (quotes included)', real.slice(0, 260));
  ok(/<svg class="i"><\/svg>/.test(real) && !/[←→⊕●]/.test(real), 'the direction is an injected SVG ICON, never a glyph/emoji (§17)');
  const multi = CR.collabRowsHtml({ rows: [HOSTILE, { ...HOSTILE, agentPath: '/root/other', agentName: 'other', threadId: 'th-2' }] }, { esc: escHtml, icons: {} });
  ok(!/<img|<script/.test(multi) && (multi.match(/class="chat-collab-name"/g) || []).length === 2, 'the coalesced row escapes every name and keeps ONE clickable chip per agent', multi.slice(0, 120));
  ok(CR.collabRowsHtml(null, { esc: escHtml }) === '' && CR.collabRowsHtml({ rows: [] }, { esc: escHtml }) === '', 'an empty collab renders nothing (never "undefined")');
  const blobRow = { dir: 'in', agentPath: '/root/x', agentName: 'x', msgType: 'MESSAGE', encrypted: true, detail: '' };
  ok(!/gAAAAAB/.test(CR.collabRowHtml(blobRow, { esc: escHtml, icons: {} }) + CR.collabRowTitle(blobRow)), 'a row has nowhere to carry an encrypted blob (the normalizer never puts one there, the builder never reads one)');
}

console.log('— ② renderer + chat-view wiring');
{
  const cr = read('src/lib/chat-renderers.js');
  ok(/renderToolMsg\(msg\) \{\s*\n\s*if \(msg\.collab\) return this\._renderCollabMsg\(msg\);/.test(cr), 'renderToolMsg dispatches a collab message BEFORE the tool-card path');
  ok(/collabRowsHtml\(collab, \{ esc: escHtml, t, icons: COLLAB_ICONS, live, now: Date\.now\(\) \}\)/.test(cr), 'the renderer injects the REAL escHtml + t + the SVG icon set (+ the view\'s liveness answer)');
  ok(/chat-agent-report-head[\s\S]{0,400}collabReportHeadText|escHtml\(collab\.agentName/.test(cr) && /chat-agent-report-body[^]{0,80}this\.renderMarkdown\(stripAnsi\(body\)\)/.test(cr), 'a sub-agent report renders an attributed head + its body as MARKDOWN (same sanitizer as assistant text)');
  ok(/renderMarkdown\(html\) \{[\s\S]{0,400}DOMPurify\.sanitize/.test(cr) || /DOMPurify\.sanitize\(marked\.parse/.test(cr), '…and renderMarkdown is the DOMPurify path (the XSS law)');
  ok(/COLLAB_ICONS = \{[\s\S]{0,220}lock: UI_ICONS\.lock,/.test(cr) && /agentIn:/.test(read('src/lib/icons.js')), 'the direction icons come from the central SVG library');
  const cv = read('src/lib/chat-view.js');
  ok(/const collabName = e\.target\.closest\?\.\('\.chat-collab-name'\);[\s\S]{0,320}this\._openCollabAgent\(\{/.test(cv), 'chat-view delegates a click on the agent NAME to _openCollabAgent');
  ok(/if \(threadId\) \{ this\._openSubagentViewer\(\{ threadId/.test(cv), '…which opens the EXISTING subagent viewer when the thread id is known (0.153.4 always knows it)');
  ok(/fetchJson\(`\/api\/subagents\?\$\{q\.toString\(\)\}`\)/.test(cv) && /showToast\(t\('This sub-agent’s conversation is not on this machine\.'\)\)/.test(cv), '…falls back to the roster route and TOASTS when the child rollout is elsewhere (no silent failure)');
  // The count is produced in chat-view (only it can see the run's rows) but the
  // LINE — its text and its position in the label — belongs to the ONE summary
  // table in the PURE module (round-5 rebase onto 2.369.37: a second per-kind
  // map in chat-view is exactly the 2.369.34 NaN class).
  const RS = await import(path.join(REPO, 'src/lib/chat-run-summary.js'));
  const tt = (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => String(p?.[x] ?? m));
  ok(/byKind\.subAgentIn = collabRows\.filter\(\(r\) => r\.dir === 'in'\)\.length;/.test(cv)
    && RS.SUMMARY_EXTRAS.includes('subAgentIn')
    && RS.runSummaryParts({ ...RS.countKinds(['agent', 'agent']), subAgentIn: 5 }, new Set(), tt).join(' · ') === '5 sub-agent messages · 2 agent ops'
    && RS.runSummaryParts(RS.countKinds(['agent']), new Set(), tt).join(' · ') === '1 agent ops',
  "the fold summary counts codex INBOUND messages as '{n} sub-agent messages' (before 'agent ops'; absent when there are none)");
  ok(/chat-run-agents[\s\S]{0,200}chat-collab-name/.test(cv) && /collabPart: collabRunPart\(collabStats, \{ now, live, t \}\)/.test(cv),
    '…and lists the run\'s sub-agents as click-through chips, while the COUNT ("{n} sub-agents · {n} messages") rides the label so the floating bar and the footer carry it too');
  ok(/for \(const nameEl of header\.querySelectorAll\('\.chat-collab-name'\)\) \{[\s\S]{0,220}ev\.stopPropagation\(\);/.test(cv), 'a chip click does NOT toggle the run (stopPropagation on the header\'s own handler)');
  const css = read('public/chat.css');
  ok(/\.chat-msg\.chat-agent-report \{[^}]*border-left: 2px solid var\(--magenta/.test(css) && /\.chat-collab-name \{/.test(css) && /\.chat-collab-line \{/.test(css), 'the report card has the tinted left strip and the rows have their compact styles (theme vars only)');
  ok(!/#[0-9a-fA-F]{3,6}/.test(css.split('Codex multi-agent collab rows')[1].split('.chat-run-header .chat-collab-name')[0]), 'no literal colors in the new CSS block (§17)');
  // the default role indicator ('border') paints EVERY .chat-msg-tool-result
  // green — the report card must not read as ordinary assistant output
  ok(/\[data-role-indicator\] \.chat-msg\.chat-agent-report \{ border-left-color: var\(--magenta/.test(css) && /\[data-role-indicator\] \.chat-msg\.chat-msg-collab \{ border-left-color: transparent/.test(css), 'the role-indicator green bar is overridden for both collab shapes (attribute + 2 classes beats the generic tool-result rule)');
  for (const k of ['{n} sub-agent messages', '{n} sub-agents', 'sub-agent report', 'payload encrypted upstream', 'This sub-agent’s conversation is not on this machine.']) {
    ok(read('src/lib/i18n-zh.js').includes(`"${k}":`) && read('src/lib/i18n-ja.js').includes(`"${k}":`), `zh + ja carry "${k.slice(0, 34)}"`);
  }
  ok(/const PURE = new Set\(\[[^\]]*'src\/collab-row\.js'/.test(read('scripts/test-architecture.mjs')), 'the builder is registered in the PURE tier (it must never grow a dependency)');
  // FOLD KIND (B-7473 integration 2026-09-06): a sub-agent's REPORT is the answer the owner opened
  // the window to read — it must NOT hide inside the 'agent' fold, which ships
  // ON by default. It has its own kind, offered in settings but UNCHECKED.
  const schema = read('src/lib/settings-schema.js');
  const defaults = /'chat\.collapseKinds':[\s\S]{0,600}?default: \[([^\]]*)\]/.exec(schema)?.[1] || '';
  ok(/collapseKind: 'report'/.test(read('src/codex-message-manager.js')), "a sub-agent report is stamped collapseKind 'report' (not 'agent')");
  ok(/\{ value: 'report', label: t\(/.test(schema) && !/'report'/.test(defaults) && /'agent'/.test(defaults), "…'report' is an OFFERED fold kind but NOT in the default set (content, not orchestration noise)", defaults);
  ok(RS.RUN_KINDS.includes('report') && RS.countKinds(['report', 'report']).report === 2
    && RS.runSummaryParts(RS.countKinds(['report', 'report', 'report']), new Set(), tt).join(' · ') === '3 sub-agent reports'
    && RS.messageKind({ collapseKind: 'report', content: [{}] }, { toolCard: true }) === 'report',
  'the run header counts the kind (an unlisted kind counts NaN and vanishes from the summary) — RUN_KINDS/SUMMARY_ORDER own it, not a chat-view map');
  for (const k of ['{n} sub-agent reports', 'Sub-agent reports (a child agent’s written answer)']) {
    ok(read('src/lib/i18n-zh.js').includes(`"${k}":`) && read('src/lib/i18n-ja.js').includes(`"${k}":`), `zh + ja carry "${k.slice(0, 34)}"`);
  }
  // the dead-token fix: --bg-secondary is not defined anywhere in this project
  ok(!/\.chat-msg\.chat-agent-report \{[^}]*var\(--bg-secondary\)/.test(css) && !/\.chat-msg\.chat-peer-message \{[^}]*var\(--bg-secondary\)/.test(css), 'the report + peer cards use a DEFINED background token (--bg-secondary is undefined here ⇒ transparent)');
}

console.log('— ④ ONE IDENTITY PER SUB-AGENT + errors are not interchangeable (round-5)');
{
  // VERBATIM record shapes from the owner's real 0.153.4 root rollout
  // (rollout-2026-09-05T13-26-05, 4807 records at the measurement): the
  // OUTBOUND legs name a child BARE ("water_research"), while the spawn
  // OUTPUT, the inbound agent_message author and SubAgentActivity all name it
  // absolutely ("/root/water_research"). Keying rows on the raw value split
  // one agent into two identities (measured: 36 identities for 20 children,
  // 98 of 409 rows with no thread id ⇒ no click-through).
  const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
  const R = (payload, type = 'response_item') => ({ timestamp: '2026-09-05T20:26:35.282Z', type, payload });
  const ENC = 'gAAAAABqnHr7RNdCFbHi1418YUkBU5f8uf1SsslzHHqPKIgVHL-zdpqrepdT3mAVovAJLO4AnkWVyOKqwzLO24e';
  const recs = [
    R({ type: 'session_meta', id: '01a0733f-f028-7462-9769-be3e761a4f19', cwd: '/w', model: 'gpt-6-astra' }),
    // spawn_agent: BARE task_name in the arguments, absolute in the output
    R({ type: 'function_call', id: 'fc_1', call_id: 'call_SPAWN1', name: 'spawn_agent', namespace: 'collaboration', arguments: JSON.stringify({ task_name: 'water_research', message: ENC }) }),
    R({ type: 'item_completed', thread_id: 'root-thread', turn_id: 't1', item: { type: 'SubAgentActivity', id: 'call_SPAWN1', kind: 'started', agent_thread_id: 'child-water', agent_path: '/root/water_research' } }, 'event_msg'),
    R({ type: 'function_call_output', id: 'fco_1', call_id: 'call_SPAWN1', output: JSON.stringify({ task_name: '/root/water_research' }) }),
    // send_message / followup_task: BARE target — the finding's carrier
    R({ type: 'function_call', id: 'fc_2', call_id: 'call_SEND1', name: 'send_message', namespace: 'collaboration', arguments: JSON.stringify({ target: 'water_research', message: ENC }) }),
    R({ type: 'function_call', id: 'fc_3', call_id: 'call_SEND2', name: 'followup_task', namespace: 'collaboration', arguments: JSON.stringify({ task_name: 'water_research', message: ENC }) }),
    // inbound: absolute author, encrypted payload
    R({ type: 'agent_message', id: 'amsg_1', author: '/root/water_research', recipient: '/root', content: [{ type: 'input_text', text: 'Message Type: MESSAGE\nTask name: /root\nSender: /root/water_research\nPayload:\n' }, { type: 'encrypted_content', encrypted_content: ENC }] }),
  ];
  const mm = new CodexMessageManager('r5');
  const msgs = mm.convertHistory(recs);
  const rows = [];
  for (const m of msgs) if (m.collab) for (const r of (m.collab.rows || [])) rows.push(r);
  const idents = new Set(rows.map((r) => r.agentPath || r.target).filter(Boolean));
  ok(rows.length === 4 && idents.size === 1 && [...idents][0] === '/root/water_research',
    'ONE identity per agent: the bare-name spawn/send/followup legs and the absolute inbound leg all key on /root/water_research', `${rows.length} rows, identities ${JSON.stringify([...idents])}`);
  ok(rows.every((r) => r.threadId === 'child-water'),
    'every row carries the child thread id once the map knows it (the outbound rows used to carry none ⇒ no click-through)', JSON.stringify(rows.map((r) => `${r.dir}:${r.threadId}`)));
  ok(Object.keys(mm.status().subagents).length === 1 && mm.status().subagents['/root/water_research'] === 'child-water',
    'status().subagents holds exactly one entry — the sub-agents summary counts DISTINCT agents, not spellings');
  // NEGATIVE CONTROL: two different parents may each own a child with the same
  // leaf name — the belt must never map one onto the other's thread.
  const mm2 = new CodexMessageManager('r5b');
  mm2.convertHistory([
    R({ type: 'session_meta', id: 'x', cwd: '/w' }),
    R({ type: 'item_completed', item: { type: 'SubAgentActivity', id: 'sa-a', kind: 'started', agent_thread_id: 'tid-a', agent_path: '/root/team_a/research' } }, 'event_msg'),
    R({ type: 'item_completed', item: { type: 'SubAgentActivity', id: 'sa-b', kind: 'started', agent_thread_id: 'tid-b', agent_path: '/root/team_b/research' } }, 'event_msg'),
  ]);
  const r2 = [];
  for (const m of mm2.messages) if (m.collab) for (const r of (m.collab.rows || [])) r2.push(r);
  ok(r2.length === 2 && r2[0].threadId === 'tid-a' && r2[1].threadId === 'tid-b',
    'negative control: two children with the SAME leaf name under different parents keep their own thread ids (the last-segment belt never overwrites an absolute path)', JSON.stringify(r2.map((r) => `${r.agentPath}=${r.threadId}`)));
  // …and the belt itself: a bare-path row left by an unknown carrier still
  // gets its thread id when the map later learns the absolute path
  const mm3 = new CodexMessageManager('r5c');
  mm3.convertHistory([R({ type: 'session_meta', id: 'y', cwd: '/w' })]);
  mm3._pushCollabRow({ dir: 'out', agentPath: 'legacy_child', agentName: 'legacy_child', msgType: 'MESSAGE', threadId: null }, false);
  mm3._noteSubagentThread('/root/legacy_child', 'tid-legacy');
  ok(mm3.messages.at(-1).collab.rows[0].threadId === 'tid-legacy', 'the belt back-fills a BARE row path from the map key’s last segment');

  // ── errors are not interchangeable ──
  // Carrier = the wrapper's synthesized standalone `sub_agent_activity`
  // (handleForeignThreadNotification: a CHILD's ErrorNotification becomes the
  // child's own row, never the root's task_failed) — verbatim field shape.
  const ERR = (event_id, detail) => R({ type: 'sub_agent_activity', event_id, occurred_at_ms: 1788639995297, agent_thread_id: 'kid', agent_path: '/root/kid', kind: 'errored', detail, thread_id: 'root-thread' }, 'event_msg');
  const mm4 = new CodexMessageManager('r5d');
  mm4.convertHistory([
    R({ type: 'session_meta', id: 'z', cwd: '/w' }),
    ERR('foreign-error-kid-1788639995297-1', 'tool exec denied by sandbox'),
    ERR('foreign-error-kid-1788639995297-2', 'stream error: 429 rate limited'),
    ERR('foreign-error-kid-1788639995298-3', 'turn aborted: context window exceeded'),
  ]);
  const errs = [];
  for (const m of mm4.messages) if (m.collab) for (const r of (m.collab.rows || [])) if (r.kind === 'errored') errs.push(r);
  ok(errs.length === 3 && new Set(errs.map((r) => r.detail)).size === 3,
    "three DIFFERENTLY-WORDED errors for one child draw three rows (the (thread,kind) key swallowed every one after the first)", JSON.stringify(errs.map((r) => r.detail)));
  // a genuine re-read of the SAME record still collapses — and an ID COLLISION
  // (Date.now() is not unique; the wrapper now also appends a counter, but the
  // key must not depend on it) does NOT hide the second failure
  const mm5 = new CodexMessageManager('r5e');
  mm5.convertHistory([
    R({ type: 'session_meta', id: 'z2', cwd: '/w' }),
    ERR('foreign-error-kid-1788639995297-1', 'same failure'),
    ERR('foreign-error-kid-1788639995297-1', 'same failure'),
    ERR('foreign-error-kid-1788639995297-1', 'a DIFFERENT failure in the same millisecond'),
  ]);
  const errs5 = [];
  for (const m of mm5.messages) if (m.collab) for (const r of (m.collab.rows || [])) if (r.kind === 'errored') errs5.push(r);
  ok(errs5.length === 2 && errs5[0].detail === 'same failure' && /DIFFERENT/.test(errs5[1].detail),
    'the same error record read twice collapses, but a colliding id with a different message still draws its row', JSON.stringify(errs5.map((r) => r.detail)));
  ok(/foreign-error-\$\{tid\}-\$\{Date\.now\(\)\}-\$\{\+\+foreignErrorSeq\}/.test(read('data/bin/codex-chat-wrapper.js')),
    'wrapper pin: the synthesized foreign-error id carries a counter (Date.now() alone is not unique)');
  // the non-error kinds keep their (thread, kind) coalescing (32 'completed'
  // records over 18 threads in the local corpus ⇒ one row per thread)
  const mm6 = new CodexMessageManager('r5f');
  mm6.convertHistory([
    R({ type: 'session_meta', id: 'z3', cwd: '/w' }),
    R({ type: 'item_completed', item: { type: 'SubAgentActivity', id: 'c1', kind: 'completed', agent_thread_id: 'kid', agent_path: '/root/kid' } }, 'event_msg'),
    R({ type: 'item_completed', item: { type: 'SubAgentActivity', id: 'c2', kind: 'completed', agent_thread_id: 'kid', agent_path: '/root/kid' } }, 'event_msg'),
  ]);
  const done = [];
  for (const m of mm6.messages) if (m.collab) for (const r of (m.collab.rows || [])) if (r.kind === 'completed') done.push(r);
  ok(done.length === 1, "negative control: 'completed' still coalesces per (thread, kind) — only 'errored' carries a message", String(done.length));
}

console.log('— ③ GET /api/subagents over a temp CODEX_HOME (real express mount)');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-subagents-'));
  const sess = path.join(dir, '.codex', 'sessions', '2026', '09', '05');
  fs.mkdirSync(sess, { recursive: true });
  const PARENT = '01a0733f-f028-7462-9769-be3e761a4f19';
  // Heads are REAL 0.153.4 shapes (rollout session_meta, cli_version 0.153.4):
  // a child carries source.subagent.thread_spawn AND a COPY of the parent's
  // meta on the next line — the copy must never be read as the child's own.
  const parentMeta = { session_id: PARENT, id: PARENT, timestamp: '2026-09-05T20:26:05.224Z', cwd: '/w', originator: 'claude-code-webui', cli_version: '0.153.4', source: 'vscode', history_mode: 'paginated' };
  const child = (id, agentPath, nickname, ts) => ({
    session_id: PARENT, id, forked_from_id: PARENT, parent_thread_id: PARENT, timestamp: ts, cwd: '/w',
    originator: 'claude-code-webui', cli_version: '0.153.4',
    source: { subagent: { thread_spawn: { parent_thread_id: PARENT, depth: 1, agent_path: agentPath, agent_nickname: nickname, agent_role: null } } },
    thread_source: 'subagent', agent_nickname: nickname, agent_path: agentPath,
    history_mode: 'paginated', subagent_history_start_ordinal: 36, multi_agent_version: 'v2',
  });
  const write = (name, metas) => fs.writeFileSync(path.join(sess, name), metas.map((m) => JSON.stringify({ timestamp: m.timestamp, ordinal: 0, type: 'session_meta', payload: m })).join('\n') + '\n');
  write(`rollout-2026-09-05T13-26-05-${PARENT}.jsonl`, [parentMeta]);
  write('rollout-2026-09-05T14-10-31-01a07368-a01e-7503-abca-c6380f68b820.jsonl', [child('01a07368-a01e-7503-abca-c6380f68b820', '/root/walkthrough_v2', 'Beauvoir', '2026-09-05T21:10:31.711Z'), parentMeta]);
  write('rollout-2026-09-05T13-40-31-01a07340-6597-74f2-882c-f7092fecd5a0.jsonl', [child('01a07340-6597-74f2-882c-f7092fecd5a0', '/root/water_research', '', '2026-09-05T20:26:35.297Z'), parentMeta]);
  // an UNRELATED conversation on the same machine must never leak in
  write('rollout-2026-09-05T15-00-00-01a07999-0000-7000-8000-000000000001.jsonl', [{ ...parentMeta, id: '01a07999-0000-7000-8000-000000000001', session_id: '01a07999-0000-7000-8000-000000000001' }]);

  const probe = `
const express = require(${JSON.stringify(path.join(REPO, 'node_modules/express'))});
const { setup, router } = require(${JSON.stringify(path.join(REPO, 'src/routes/sessions.js'))});
const app = express();
// setup(ctx) wires the module-level router (it returns nothing) — mount THAT
setup({ activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => {}, createSessionMessages: () => null, BUFFERS_DIR: '/tmp', PERMISSION_MODES: [], execFileSync: () => '', hosts: { get: () => null }, serverSetting: () => null });
app.use(router);
const srv = app.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const get = async (q) => { const r = await fetch(base + '/api/subagents' + q); return { status: r.status, body: await r.json() }; };
  const out = {
    codex: await get('?backend=codex&threadId=${PARENT}'),
    cached: await get('?backend=codex&threadId=${PARENT}'),
    claude: await get('?backend=claude&threadId=x'),
    remote: await get('?backend=codex&threadId=${PARENT}&host=h1'),
    missing: await get('?backend=codex'),
    stranger: await get('?backend=codex&threadId=01a07999-0000-7000-8000-000000000001'),
  };
  console.log('@@' + JSON.stringify(out));
  srv.close(); process.exit(0);
});
`;
  const r = spawnSync(process.execPath, ['-e', probe], { env: { ...process.env, HOME: dir }, encoding: 'utf8', timeout: 60000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  ok(!!line, 'the route probe ran (real express mount, HOME=temp CODEX_HOME)', (r.stderr || '').slice(-400));
  const out = line ? JSON.parse(line.slice(2)) : {};
  const list = out.codex?.body?.subagents || [];
  ok(list.length === 2, 'the roster lists exactly the conversation\'s OWN children (an unrelated thread never leaks in)', JSON.stringify(list));
  const w = list.find((s) => s.agentPath === '/root/walkthrough_v2');
  ok(w && w.threadId === '01a07368-a01e-7503-abca-c6380f68b820' && w.nickname === 'Beauvoir' && w.depth === 1 && w.startedAt > 0, 'each row carries agentPath / nickname / threadId / depth / startedAt (from the child\'s OWN thread_spawn, not the inherited parent copy)', JSON.stringify(w));
  ok(list[0].startedAt <= list[1].startedAt, 'rows are ordered by spawn time', list.map((s) => s.startedAt).join(','));
  ok(out.cached?.body?.cached === true && JSON.stringify(out.cached.body.subagents) === JSON.stringify(list), 'a second ask inside 10s is served from cache (the walk is not free)');
  // WIRING PIN (B-7473 integration 2026-09-06): the route must not walk the tree ON the event loop —
  // it uses the transcript-worker twin. A sync require here is the regression.
  const routeSrc = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8');
  ok(/collectCodexThreadMetasAsync/.test(routeSrc) && !/[^A-Za-z]collectCodexThreadMetas\(/.test(routeSrc), 'the roster walk runs OFF the event loop (collectCodexThreadMetasAsync, the worker twin) — never the sync walk', routeSrc.match(/collectCodexThreadMetas\w*/g)?.join(','));
  ok(out.claude?.body?.reason === 'unsupported-backend' && (out.claude.body.subagents || []).length === 0, 'a non-codex backend gets a NAMED refusal, not a bare empty list');
  ok(out.remote?.body?.reason === 'remote-machine', 'a remote session says the children live on another machine (a silent [] would read as "no sub-agents")');
  ok(out.missing?.status === 400, 'a missing threadId is a 400');
  ok((out.stranger?.body?.subagents || []).length === 0, 'a conversation with no children answers with an empty roster');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('— ④ a v2 sub-agent is NEVER listed as the owner\'s own conversation (local listing · daemon snapshot · ssh script · sidebar)');
{
  // Owner 2026-09-25: "截图里这么多subagent啥情况，为啥没自动filter掉" — dozens
  // of codex v2 sub-agents (Singer, Pasteur, …, each with the 12 px ↳ kind icon
  // that reads as an orange "L") in the Sessions list. The fixture is the REAL
  // 0.153 v2 key shape (keys measured on this box's rollouts, values synthetic):
  // a parent, two children (the 32/35 forked+parent-copy shape and the 3/35
  // bare shape), and a USER fork of the parent that must stay primary.
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const DF = require(path.join(REPO, 'src/discovery-facts.js'));
  const FIX = path.join(REPO, 'scripts/fixtures/codex-subagent-v2');
  // minted, never spelled (test-fixture-isolation (c)): the fixture files are named by these ids
  const P = fixtureSid('a001'), C1 = fixtureSid('a002'), C2 = fixtureSid('a003'), F = fixtureSid('a004');
  const metaOf = (f) => JSON.parse(fs.readFileSync(path.join(FIX, fs.readdirSync(FIX).find((n) => n.includes(f))), 'utf8').split('\n')[0]).payload;

  // ── the PURE rule (one classifier for every transport) ──
  const kid = DF.classifyCodexThread(metaOf(C1));
  ok(kid.agentKind === 'subagent' && kid.parentThreadId === P && kid.agentNickname === 'Alice' && kid.agentPath === '/root/parser_audit' && kid.depth === 1 && kid.agentRole === '',
    'a real-shaped v2 child is a SUB-AGENT with its parent, nickname and path (agent_role null ⇒ no role invented)', JSON.stringify(kid));
  const topOnly = { ...metaOf(C2) }; delete topOnly.source;               // constructed: the top-level marker alone
  const t1 = DF.classifyCodexThread(topOnly);
  ok(t1.agentKind === 'subagent' && t1.parentThreadId === P && t1.agentNickname === 'Bob' && t1.agentPath === '/root/docs_sweep',
    'the top-level `thread_source: "subagent"` alone (no source.subagent) still classifies — the two spellings are one fact', JSON.stringify(t1));
  const fork = DF.classifyCodexThread(metaOf(F));
  ok(fork.agentKind === 'primary' && fork.parentThreadId === null, 'a USER fork (forked_from_id, no thread_source subagent) stays PRIMARY — it is its own conversation', JSON.stringify(fork));
  ok(DF.classifyCodexThread({ source: 'cli', thread_source: 'user' }).agentKind === 'primary' && DF.classifyCodexThread({ source: { subagent: 'review' } }).agentKind === 'review' && DF.classifyCodexThread({ source: { subagent: 'compact' } }).agentKind === 'subagent',
    'thread_source "user" = primary; source.subagent "review" = review; any other source.subagent shape = a machine-spawned thread');
  const { normalizeCodexSource } = require(path.join(REPO, 'src/adapters/codex.js'));
  ok(normalizeCodexSource(metaOf(C1).source).agentKind === 'subagent' && normalizeCodexSource('vscode').agentKind === 'primary' && normalizeCodexSource(null).agentKind === 'primary',
    'normalizeCodexSource (the live wrapper_meta path) is the same rule over a bare source');

  // ── one judge for every listing ──
  const judge = (rows) => {
    const by = new Map(rows.map((r) => [r.sessionId || r.threadId, r]));
    const bad = [];
    const kind = (r) => (r && r.agentKind) || 'primary';
    if (!by.has(P) || kind(by.get(P)) !== 'primary') bad.push('parent not primary');
    for (const [id, nick] of [[C1, 'Alice'], [C2, 'Bob']]) {
      const r = by.get(id);
      if (!r) { bad.push(nick + ' missing'); continue; }
      if (kind(r) !== 'subagent') bad.push(`${nick} listed as ${kind(r)}`);
      if (r.parentThreadId !== P) bad.push(`${nick} parent ${r.parentThreadId}`);
      if (r.name !== nick) bad.push(`${nick} named ${JSON.stringify(r.name)}`);
    }
    if (!by.has(F) || kind(by.get(F)) !== 'primary' || by.get(F).parentThreadId) bad.push('user fork not primary');
    return bad;
  };

  // ── a temp HOME holding the fixture (+ the depth-2 native-fork children) ──
  const home = scratchHome('codex-subagents', fs, ['.codex/sessions/2026/09/20', '.claude/projects', '.claude/sessions']);
  scratchHomes.push(home);
  const day = path.join(home, '.codex/sessions/2026/09/20');
  for (const n of fs.readdirSync(FIX)) fs.copyFileSync(path.join(FIX, n), path.join(day, n));
  const NF = path.join(REPO, 'scripts/fixtures/codex-native-fork');
  for (const n of fs.readdirSync(NF)) fs.copyFileSync(path.join(NF, n), path.join(day, n));

  // mutants: M_TS ignores the top-level marker; M_NONE is the "nothing sets
  // agentKind" state the report was filed against (only review survives)
  const M = mutantCopies('codex-subagents', REPO);
  const dfSrc = fs.readFileSync(path.join(REPO, 'src/discovery-facts.js'), 'utf8');
  const TS_LEG = "if (p.thread_source === 'subagent' || subAgent) {";
  const SPAWN_LEG = 'if (spawn) {';
  ok(dfSrc.includes(TS_LEG) && dfSrc.includes(SPAWN_LEG), 'the mutated legs exist verbatim in the classifier (else the controls judge nothing)');
  const dfTs = M.write('src/discovery-facts.js', dfSrc.replace(TS_LEG, 'if (subAgent) {'), 'ignore-thread-source');
  const dfNone = M.write('src/discovery-facts.js', dfSrc.replace(SPAWN_LEG, 'if (false && spawn) {').replace(TS_LEG, 'if (false) {'), 'no-subagents');
  const mTs = require(dfTs);
  ok(mTs.classifyCodexThread(topOnly).agentKind === 'primary', 'NEGATIVE CONTROL: a classifier that ignores thread_source lists the top-level-only child as PRIMARY (the leg above is load-bearing)');
  const cxSrc = fs.readFileSync(path.join(REPO, 'src/adapters/codex.js'), 'utf8');
  const cxNone = M.write('src/adapters/codex.js', cxSrc.replace("require('../discovery-facts')", `require(${JSON.stringify(dfNone)})`), 'no-subagents');
  const stSrc = fs.readFileSync(path.join(REPO, 'src/codex-session-store.js'), 'utf8');
  const stNone = M.write('src/codex-session-store.js', stSrc.replace("require('./adapters/codex')", `require(${JSON.stringify(cxNone)})`), 'no-subagents');

  const probe = `
const path = require('path');
const out = {};
(async () => {
  const store = require(${JSON.stringify(path.join(REPO, 'src/codex-session-store.js'))});
  const pick = (l) => l.map((s) => ({ sessionId: s.sessionId, agentKind: s.agentKind, parentThreadId: s.parentThreadId, name: s.name, forkedFromId: s.forkedFromId }));
  out.async = pick(await store.listCodexThreadsAsync({ activeSessions: new Map() }));
  out.sync = pick(store.listCodexThreads({ activeSessions: new Map() }));
  out.mutant = pick(require(${JSON.stringify(stNone)}).listCodexThreads({ activeSessions: new Map() }));
  const express = require(${JSON.stringify(path.join(REPO, 'node_modules/express'))});
  const { setup, router } = require(${JSON.stringify(path.join(REPO, 'src/routes/sessions.js'))});
  setup({ activeSessions: new Map(), webuiPids: new Set(), refreshWebuiPids: () => {}, createSessionMessages: () => null, BUFFERS_DIR: '/tmp', PERMISSION_MODES: [], execFileSync: () => '', hosts: { get: () => null }, serverSetting: () => null });
  const app = express(); app.use(router);
  const srv = app.listen(0, '127.0.0.1', async () => {
    const base = 'http://127.0.0.1:' + srv.address().port;
    out.sub = await (await fetch(base + '/api/subagents?backend=codex&threadId=${P}')).json();
    out.subFork = await (await fetch(base + '/api/subagents?backend=codex&threadId=${F}')).json();
    console.log('@@' + JSON.stringify(out));
    process.exit(0);
  });
})().catch((e) => { console.log('@@' + JSON.stringify({ error: String(e && e.stack || e) })); process.exit(1); });
`;
  const r = spawnSync(process.execPath, ['-e', probe], { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 90000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  const o = line ? JSON.parse(line.slice(2)) : {};
  ok(!!line && !o.error, 'the listing probe ran (HOME = a scratch home holding the fixture)', o.error || (r.stderr || '').slice(-400));
  const a = judge(o.async || []);
  ok(a.length === 0, 'the 5 s-poll listing (listCodexThreadsAsync, the worker path) marks both children SUB-AGENT under their parent, named by nickname; the parent and the user fork stay primary', a.join('; '));
  ok(judge(o.sync || []).length === 0, 'the sync listing (user-action consumers) agrees', judge(o.sync || []).join('; '));
  const nf = (o.async || []).filter((s) => s.sessionId.startsWith('01a072d7-'));
  ok(nf.length === 2 && nf.every((s) => s.agentKind === 'subagent') && nf.some((s) => s.parentThreadId === '01a072d7-92f1-7c20-987b-a96af83c2e76'),
    'the depth-2 native-fork children (a grandchild under a child) list as sub-agents too', JSON.stringify(nf));
  const mj = judge(o.mutant || []);
  ok(mj.length > 0 && mj.some((x) => /Alice listed as primary/.test(x)), 'NEGATIVE CONTROL: a store whose classifier never marks a sub-agent FAILS the same judge (the pre-classification state the report describes)', mj.join('; '));
  const subs = (o.sub && o.sub.subagents) || [];
  ok(subs.length === 2 && subs.map((s) => s.threadId).sort().join() === [C1, C2].sort().join() && subs.every((s) => s.nickname && s.agentPath),
    "the parent's GET /api/subagents lists exactly its two children (with nickname + agent path) — the parent card's View sub-agents", JSON.stringify(subs));
  ok(((o.subFork && o.subFork.subagents) || []).length === 0, 'a user fork has no sub-agents of its own (its forked_from_id never makes the parent ITS child, nor it a child)');

  // ── the device rung: the daemon snapshot child → synthesize → interpret ──
  const snapRun = spawnSync(process.execPath, [path.join(REPO, 'src/agentd/agentd.js'), '--discovery-snapshot-child'], { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
  let snap = null; try { snap = JSON.parse(snapRun.stdout); } catch { }
  ok(!!snap && Array.isArray(snap.codexRollouts), 'the daemon snapshot child ran over the scratch home', (snapRun.stderr || '').slice(-300));
  const snapLines = DF.synthesizeDiscoveryLines(snap || {});
  ok((snapLines.match(/^SC /mg) || []).length === 4 && !snapLines.includes(`SC ${path.join(day, fs.readdirSync(day).find((n) => n.includes(P)))}`),
    'the snapshot carries an SC fact for every sub-agent rollout and none for a primary', (snapLines.match(/^SC [^\t]*/mg) || []).join(' | '));
  const dev = DF.interpretDiscoveryLines(snapLines, { hostId: 'hdev', hostName: 'Dev', claimJsonls: () => new Map() });
  ok(judge(dev).length === 0, 'the device rung lists the children as sub-agents under their parent, named by nickname (not the PARENT\'s first message the inherited copy carries)', judge(dev).join('; ') + ' ' + JSON.stringify(dev.map((s) => [s.sessionId.slice(-4), s.agentKind, s.name])));
  const devP = dev.find((s) => s.sessionId === P);
  ok(devP && !('agentKind' in devP) && !('parentThreadId' in devP), 'a primary remote card keeps its shape byte-for-byte (no new keys)', JSON.stringify(devP));

  // ── the ssh rung: the REAL composed script, run by sh over the scratch home ──
  const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
  const dataDir = path.join(home, 'hostdata'); fs.mkdirSync(dataDir, { recursive: true });
  const hm = new HostManager({ dataDir });
  hm._state.hosts.push({ id: 'hssh', name: 'Box', transport: 'ssh' });
  let ranScript = '';
  hm._ssh = async (h, script) => {
    ranScript = script;
    const rr = spawnSync('sh', ['-c', script], { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
    return rr.stdout || '';
  };
  let sshCards = [];
  try { sshCards = await hm.discoverSessions('hssh', { ttlMs: 0 }); } catch (e) { ok(false, 'ssh discovery ran', e.message); }
  const codexSsh = sshCards.filter((s) => s.backend === 'codex');
  ok(/printf 'SC %s\\t'/.test(ranScript) && codexSsh.length === 6, 'the composed ssh script ran for real (sh, scratch HOME) and listed every rollout', `${codexSsh.length} codex cards`);
  ok(judge(codexSsh).length === 0, 'the ssh rung classifies exactly like the local listing (SC line → the one classifier)', judge(codexSsh).join('; ') + ' ' + JSON.stringify(codexSsh.map((s) => [s.sessionId.slice(-4), s.agentKind, s.name])));
  const sig = (l) => l.filter((s) => s.backend === 'codex' || s.agentKind !== undefined).map((s) => [s.sessionId, s.agentKind || 'primary', s.parentThreadId || null, s.name || null].join('|')).sort().join('\n');
  ok(sig(codexSsh) === sig(dev), 'device rung ≡ ssh rung (sessionId, kind, parent, name) — no twin drift', sig(codexSsh) + '\n≠\n' + sig(dev));
  const localSig = (o.async || []).map((s) => [s.sessionId, s.agentKind || 'primary', s.parentThreadId || null].join('|')).sort().join('\n');
  ok(localSig === sig(codexSsh).split('\n').map((l) => l.split('|').slice(0, 3).join('|')).join('\n'), 'local listing ≡ remote rungs on (sessionId, kind, parent)', localSig);

  // ── EVERY listed rollout is classified, not only the 30 with head facts ──
  // (verifier 2026-09-24: the SC leg sat INSIDE the capped head-fact loop —
  // `head -30` in the ssh script, `slice(0, 30)` in the daemon — while the C
  // listing names up to 100 rollouts; on the owner's real store 25 of 48
  // sub-agents still listed as primary, nameless conversations.) A generated
  // store of 45 rollouts (5 primaries, 40 sub-agents interleaved by mtime so
  // children sit at positions 31–45), each own meta padded to the measured
  // real size (~22 KB of base_instructions), judged on ALL rows by all rungs.
  {
    const bigHome = scratchHome('codex-subagents-big', fs, ['.codex/sessions/2026/09/21', '.claude/projects', '.claude/sessions']);
    scratchHomes.push(bigHome);
    const bday = path.join(bigHome, '.codex/sessions/2026/09/21');
    const pad = 'x'.repeat(22000);
    const metaLine = (p, ord) => JSON.stringify({ timestamp: p.timestamp, ordinal: ord, type: 'session_meta', payload: p });
    const userLine = (text, ord) => JSON.stringify({ timestamp: '2026-09-21T10:00:01.000Z', ordinal: ord, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    const primaryMeta = (id) => ({ session_id: id, id, timestamp: '2026-09-21T10:00:00.000Z', cwd: '/work/demo', originator: 'claude-code-webui', cli_version: '0.153.4', source: 'vscode', model_provider: 'openai', base_instructions: { text: pad }, history_mode: 'paginated' });
    const want = new Map(); // id -> kind|parent
    const t0 = Date.now() / 1000;
    let lastPrimary = null;
    for (let i = 0; i < 45; i++) {
      const id = fixtureSid('b' + (i + 1).toString(16).padStart(3, '0'));
      const fn = path.join(bday, `rollout-2026-09-21T10-${String(i).padStart(2, '0')}-00-${id}.jsonl`);
      let body;
      if (i % 9 === 0) {
        lastPrimary = id;
        body = [metaLine(primaryMeta(id), 0), userLine(`fixture task number ${i}`, 1)];
        want.set(id, 'primary|');
      } else {
        const nick = `Helper${i}`;
        const own = { ...primaryMeta(id), session_id: lastPrimary, forked_from_id: lastPrimary, parent_thread_id: lastPrimary, source: { subagent: { thread_spawn: { parent_thread_id: lastPrimary, depth: 1, agent_path: `/root/task_${i}`, agent_nickname: nick, agent_role: null } } }, thread_source: 'subagent', agent_nickname: nick, agent_path: `/root/task_${i}`, multi_agent_version: 'v2' };
        body = [metaLine(own, 0), metaLine(primaryMeta(lastPrimary), 1), userLine('the parent task the copy carries', 2), userLine(`sub-task ${i}`, 3)];
        want.set(id, 'subagent|' + lastPrimary);
      }
      fs.writeFileSync(fn, body.join('\n') + '\n');
      fs.utimesSync(fn, t0 - i * 60, t0 - i * 60); // i = mtime rank (0 = newest)
    }
    const wantSig = [...want].map(([id, v]) => id + '|' + v).sort().join('\n');
    const sigOf = (rows) => rows.filter((s) => s.backend === 'codex' || s.agentKind !== undefined || s.threadId).map((s) => [s.sessionId || s.threadId, s.agentKind || 'primary', s.parentThreadId || ''].join('|')).sort().join('\n');
    const miss = (rows) => { const got = new Set(sigOf(rows).split('\n')); return [...want].filter(([id, v]) => !got.has(id + '|' + v)).map(([id, v]) => id.slice(-4) + ':' + v.split('|')[0]); };
    // local listing
    const lr = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(REPO, 'src/codex-session-store.js'))}).listCodexThreadsAsync({ activeSessions: new Map() }).then((l) => { console.log('@@' + JSON.stringify(l.map((s) => ({ sessionId: s.sessionId, agentKind: s.agentKind, parentThreadId: s.parentThreadId, backend: 'codex' })))); process.exit(0); })`], { env: { ...process.env, HOME: bigHome }, encoding: 'utf8', timeout: 90000 });
    const lline = (lr.stdout || '').split('\n').find((l) => l.startsWith('@@'));
    const local = lline ? JSON.parse(lline.slice(2)) : [];
    ok(local.length === 45 && miss(local).length === 0, 'the local listing over a 45-rollout store: 40 sub-agents + 5 primaries, every parent right (the truth the remote rungs must match)', `${local.length} rows; wrong: ${miss(local).join(' ')}`);
    // daemon rung (real + a mutant that re-caps the SC leg at 30)
    const snapOf = (entry) => {
      const rr = spawnSync(process.execPath, [entry, '--discovery-snapshot-child'], { env: { ...process.env, HOME: bigHome }, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
      let j = null; try { j = JSON.parse(rr.stdout); } catch { }
      return j ? DF.interpretDiscoveryLines(DF.synthesizeDiscoveryLines(j), { hostId: 'hbig', hostName: 'Big', claimJsonls: () => new Map() }) : [];
    };
    const devBig = snapOf(path.join(REPO, 'src/agentd/agentd.js'));
    ok(devBig.filter((s) => s.backend === 'codex').length === 45 && miss(devBig).length === 0, 'the device rung classifies ALL 45 rollouts (children past the 30 head-fact slots included)', `${devBig.filter((s) => s.backend === 'codex').length} codex cards; wrong: ${miss(devBig).join(' ')}`);
    const agSrcBig = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
    const SC_ALL = 'codexRollouts.forEach((r, i) => {';
    ok(agSrcBig.includes(SC_ALL), 'the daemon SC leg walks every listed rollout (the mutated line exists verbatim)');
    const devCap = snapOf(M.write('src/agentd/agentd.js', agSrcBig.replace(SC_ALL, 'codexRollouts.slice(0, 30).forEach((r, i) => {'), 'sc-cap-30'));
    const capMiss = miss(devCap);
    ok(devCap.length > 0 && capMiss.length >= 10 && capMiss.every((x) => /:subagent$/.test(x)), 'NEGATIVE CONTROL: a daemon whose SC leg is re-capped at 30 lists the older children as PRIMARY (the uncapped leg is load-bearing)', `${capMiss.length} wrong: ${capMiss.join(' ')}`);
    // ssh rung (real composed script + a mutant that re-caps the SC leg at 30)
    const sshOf = async (HM) => {
      const d = path.join(bigHome, 'hostdata-' + Math.random().toString(36).slice(2)); fs.mkdirSync(d, { recursive: true });
      const h = new HM({ dataDir: d });
      h._state.hosts.push({ id: 'hbig', name: 'Big', transport: 'ssh' });
      h._ssh = async (_h, script) => spawnSync('sh', ['-c', script], { env: { ...process.env, HOME: bigHome }, encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 }).stdout || '';
      try { return (await h.discoverSessions('hbig', { ttlMs: 0 })).filter((s) => s.backend === 'codex'); } catch (e) { return []; }
    };
    const sshBig = await sshOf(HostManager);
    ok(sshBig.length === 45 && miss(sshBig).length === 0, 'the ssh rung classifies ALL 45 rollouts (the SC leg runs outside the head -30 slot)', `${sshBig.length} codex cards; wrong: ${miss(sshBig).join(' ')}`);
    ok(sigOf(sshBig) === wantSig && sigOf(devBig.filter((s) => s.backend === 'codex')) === wantSig && sigOf(local) === wantSig, 'device ≡ ssh ≡ local on (id, kind, parent) for EVERY row of the 45-rollout store');
    const byIdBig = new Map(sshBig.map((s) => [s.sessionId, s]));
    const nameless = [...want].filter(([, v]) => v.startsWith('subagent|')).map(([id]) => byIdBig.get(id) || { sessionId: id }).filter((s) => !/^Helper\d+$/.test(s.name || ''));
    ok(nameless.length === 0, 'every remote child is named by its nickname, past the head-fact slots too (the NC name leg stays capped at 30 — documented)', nameless.map((s) => s.sessionId.slice(-4) + '=' + JSON.stringify(s.name)).join(' '));
    const hsSrcBig = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
    const SSH_SC = `[ -n "$TID" ] && printf '%s\\\\n' "$HD" | grep '"type":"session_meta"'`;
    ok(hsSrcBig.includes(SSH_SC), 'the ssh SC leg exists verbatim (else the ssh control judges nothing)');
    const hsCap = M.write('src/hosts.js', hsSrcBig.replace(SSH_SC, `[ "$i" -le 30 ] && ${SSH_SC}`), 'sc-cap-30');
    const sshCap = await sshOf(require(hsCap).HostManager);
    const sshCapMiss = miss(sshCap);
    ok(sshCap.length === 45 && sshCapMiss.length >= 10 && sshCapMiss.every((x) => /:subagent$/.test(x)), 'NEGATIVE CONTROL: an ssh script whose SC leg is re-capped at 30 lists the older children as PRIMARY', `${sshCap.length} cards, ${sshCapMiss.length} wrong`);
  }

  // ── the sidebar: primary-only by default, the choice a page VIEW, remote zones filtered ──
  const AM = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  ok(AM.agentKindFilterAtLoad(null) === 'primary' && AM.agentKindFilterAtLoad('all') === '' && AM.agentKindFilterAtLoad('subagent') === 'subagent' && AM.agentKindFilterAtLoad('bogus') === 'primary',
    'agentKindFilterAtLoad: nothing chosen ⇒ primary only; all ⇒ ALL; an unknown value ⇒ primary');
  ok(AM.passesAgentKindFilter({ agentKind: 'subagent' }, 'primary') === false && AM.passesAgentKindFilter({}, 'primary') === true && AM.passesAgentKindFilter({ agentKind: 'subagent' }, '') === true,
    'passesAgentKindFilter: a sub-agent never passes primary-only; a kind-less (legacy) row is primary');
  const sbSrc = read('src/lib/sidebar.js'), wbSrc = read('src/lib/sidebar-workbench.js');
  ok(!/localStorage\.setItem\(['"]agentKindFilter/.test(sbSrc) && /localStorage\.removeItem\(AGENT_KIND_FILTER_KEY\)/.test(sbSrc) && /sessionStorage\.getItem\(AGENT_KIND_FILTER_KEY\)/.test(sbSrc) && /this\._agentKindFilter = agentKindFilterAtLoad\(storedKind\)/.test(sbSrc),
    'WIRING: the sidebar never PERSISTS a kind choice (sessionStorage only) and drops the legacy localStorage key at load — a one-click ALL/↳ can no longer flood every later load');
  ok(/passesAgentKindFilter\(s, this\._agentKindFilter\)/.test(sbSrc) && /sidebar-kind-hint/.test(sbSrc) && /tr\('Main conversations only'\)/.test(sbSrc),
    'WIRING: the local list filters through the ONE predicate, and a non-primary view says so in words with the way back');
  ok((wbSrc.match(/passesAgentKindFilter\(s, this\._agentKindFilter\)/g) || []).length >= 3 && /agentKind: s\.agentKind \|\| 'primary',\n\s*sourceKind: s\.sourceKind/.test(wbSrc),
    'WIRING: every remote zone (Recent count, Recent/History list, cross-host search) applies the same filter, and a remote card keeps its agent identity');
  // ── a sub-agent that lives ONLY on a remote host is reachable and disclosed ──
  // (verifier r1, 2026-09-24: the ↳ / ALL tabs and the kind hint read the local
  // sessions alone, so with a primary-only local list a remote host's children
  // were filtered out with no tab to show them, and a cross-host search for one
  // answered "No sessions found".) Driven on the REAL Sidebar prototype over a
  // minimal DOM stand-in; the mutant reads `_allSessions` alone and goes red.
  {
    const mkEl = (tag) => {
      const el = {
        tagName: tag, children: [], className: '', textContent: '', title: '', style: { setProperty() { } },
        classList: { add: (c) => { el.className = (el.className + ' ' + c).trim(); }, contains: (c) => el.className.split(/\s+/).includes(c) },
        setAttribute() { }, append(...c) { el.children.push(...c); }, appendChild(c) { el.children.push(c); return c; },
      };
      Object.defineProperty(el, 'innerHTML', { get: () => el._html || '', set: (v) => { el._html = v; el.children = []; } });
      return el;
    };
    // import BEFORE the stand-in exists: utils.js binds document listeners at load
    const { Sidebar } = await import(path.join(REPO, 'src/lib/sidebar.js'));
    const byId = new Map();
    const mem = new Map();
    globalThis.document = { createElement: mkEl, getElementById: (id) => byId.get(id) || null };
    globalThis.sessionStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    const subLabel = AM.getAgentKindMeta('subagent').label;
    const drive = async (SB) => {
      const tabs = mkEl('div'); byId.set('agent-kind-quick-tabs', tabs);
      const self = Object.create(SB.prototype);
      Object.assign(self, {
        _allSessions: [{ sessionId: 'local-1', name: 'local work' }],
        _wbRemoteHosts: new Map([['hbox', { loading: false, sessions: [{ sessionId: P, name: 'audit the parser', hostName: 'Box', backend: 'codex' }, { sessionId: C1, agentKind: 'subagent', parentThreadId: P, name: 'Alice', hostName: 'Box', backend: 'codex' }] }]]),
        _hostsData: { hosts: [{ id: 'hbox', name: 'Box' }] },
        _agentKindFilter: 'primary', listEl: mkEl('div'), _render() { },
      });
      const out = {};
      self._renderAgentKindQuickTabs();
      out.subTab = tabs.children.some((b) => b.title === subLabel);
      out.allTab = tabs.children.some((b) => b.textContent === 'ALL');
      self._renderRemoteSearchAll('alice', null);
      const txt = (el) => [el.textContent || '', ...(el.children || []).map(txt)].join(' ');
      out.searchHidden = self.listEl.children.some((c) => /wb-kind-hidden-row/.test(c.className) && /1 more on Box/.test(txt(c)));
      out.hiddenCount = self._wbKindHidden(self._wbRemoteHosts.get('hbox').sessions);
      self.listEl = mkEl('div'); self._agentKindFilter = ''; self._appendKindHint();
      out.hint = self.listEl.children.some((c) => /sidebar-kind-hint/.test(c.className));
      const showAll = self.listEl.children.length ? null : 'none';
      self._agentKindFilter = 'primary'; self.listEl = mkEl('div');
      self._kindHiddenRow(3, 'Box').children.find((c) => c.type === 'button').onclick({ stopPropagation() { } });
      out.showAll = showAll || (self._agentKindFilter === '' && mem.get('agentKindFilter') === 'all');
      return out;
    };
    const real = await drive(Sidebar);
    ok(real.subTab && real.allTab, 'a primary-only local list + a remote host holding a sub-agent ⇒ the ↳ and ALL tabs are drawn (the kind census spans the remote lists)', JSON.stringify(real));
    ok(real.hint, 'the ALL view discloses itself (sub-agent threads are listed too) when only a REMOTE host holds them', JSON.stringify(real));
    ok(real.searchHidden && real.hiddenCount === 1, 'a cross-host search whose only match is a filtered sub-agent says "1 more on Box hidden by the agent-kind filter" — never a silent "No sessions found"', JSON.stringify(real));
    ok(real.showAll === true, 'the hidden-row button shows ALL for this page (sessionStorage only, never localStorage)', JSON.stringify(real));
    const sbSrcUi = fs.readFileSync(path.join(REPO, 'src/lib/sidebar.js'), 'utf8');
    const UNION = 'for (const st of this._wbRemoteHosts?.values() || []) if (st?.sessions) lists.push(st.sessions);';
    ok(sbSrcUi.includes(UNION), 'the union line exists verbatim (else the control judges nothing)');
    const { Sidebar: SbLocal } = await import(M.write('src/lib/sidebar.js', sbSrcUi.replace(UNION, '/* local only */'), 'kinds-local-only', { esm: true }));
    const mut = await drive(SbLocal);
    ok(!mut.subTab && !mut.hint, 'NEGATIVE CONTROL: a census that reads `_allSessions` alone draws no ↳ tab and no hint — the remote-only sub-agent is unreachable (the verifier\'s repro)', JSON.stringify(mut));
    ok((read('src/lib/sidebar-workbench.js').match(/^\s*this\._renderAgentKindQuickTabs\?\.\(\); \/\/ the kind census spans remote lists/mg) || []).length === 2,
      'WIRING: a landing remote list re-draws the kind tabs (fetch + the remote-sessions push)');
    delete globalThis.document; delete globalThis.sessionStorage;
  }

  const hsSrc = read('src/hosts.js'), agSrc = read('src/agentd/agentd.js');
  ok(/printf 'SC %s\\\\t'/.test(hsSrc) && /codexScTokensFromHead\(head, tid\)/.test(agSrc) && /lines\.push\(`SC \$\{r\.path\}\\t\$\{r\.agentTokens\}`\)/.test(dfSrc),
    'STANDING SWEEP: the ssh script, the daemon snapshot and the synthesizer all carry the SC fact');
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 4 })) ok(c.pass, c.name, c.detail);
}

// ── the REAL home is untouched (this process was re-homed before any fixture was written) ──
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(lit.offenders.length === 0, `the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, JSON.stringify(lit.offenders.slice(0, 3)));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
