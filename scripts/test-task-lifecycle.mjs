#!/usr/bin/env node
// Background-task lifecycle from HISTORY (2.368.30, owner on c1206711: "很多
// subagent任务你没识别出来" + "多个workflow像tasks那样收起来"). Ground truth
// from the 602MB field transcript: the task_started/task_progress/
// task_notification SYSTEM subtypes are live-stream-only — the file carries
// ZERO — while the launch ACKs and the <task-notification> USER records are
// all persisted. So the lifecycle must derive from those two, or every resume
// loses every background card. Fixture shapes are copied from the real
// transcript (fixtures-from-real-data law).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { parseBackgroundLaunch } = require(path.join(REPO, 'src/message-manager.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));

// ── the PURE parser, on real ack shapes ──
const AGENT_ACK = 'Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)\nagentId: afebc69a80454c5a0 (internal)';
const p1 = parseBackgroundLaunch('Agent', { description: 'Recon prepaid-mode touchpoints' }, AGENT_ACK);
ok('Agent launch ack → {type agent, id, description} (real transcript shape)', p1 && p1.type === 'agent' && p1.id === 'afebc69a80454c5a0' && /Recon/.test(p1.description), JSON.stringify(p1));
const p2 = parseBackgroundLaunch('Workflow', {}, 'Workflow "review-changes" started in the background.\nRun ID: wf_abc123-def\nUse /workflows to watch.');
ok('Workflow launch ack → {type workflow, id=runId, name}', p2 && p2.type === 'workflow' && p2.id === 'wf_abc123-def' && p2.description === 'review-changes', JSON.stringify(p2));
const p3 = parseBackgroundLaunch('Bash', { description: 'Watch entry-point PR CI' }, 'Command running in background with ID: b66o53t0o. Output is being written to: /tmp/x.output');
ok('background Bash ack → {type command, id=taskId}', p3 && p3.type === 'command' && p3.id === 'b66o53t0o', JSON.stringify(p3));
ok('a FOREGROUND result synthesizes nothing (negative control)', parseBackgroundLaunch('Bash', {}, 'total 12\ndrwxr-x foo') === null && parseBackgroundLaunch('Agent', {}, 'Here is my report: …') === null);

// ── end-to-end through the normalizer, HISTORY conversion (real record shapes) ──
const TU = 'toolu_019W5ktfvTJx9Kmn91CUgDvs';
const hist = [
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: TU, name: 'Agent', input: { description: 'Recon prepaid-mode touchpoints', prompt: 'x' } }] } },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: TU, content: AGENT_ACK }] } },
];
const mm = createMessageManager('claude', 'test-hist');
mm.convertHistory(hist);
const toolMsg = mm.messages.find((m) => m.content?.[0]?.toolCallId === TU);
ok('history conversion synthesizes taskInfo running from the ack (no task_started needed)', toolMsg?.taskInfo?.status === 'running' && toolMsg.taskInfo.type === 'agent' && toolMsg.taskInfo.id === 'afebc69a80454c5a0', JSON.stringify(toolMsg?.taskInfo || null));
// the persisted wakeup record closes it — real shape from the transcript
const NOTIF = `<task-notification>\n<task-id>b66o53t0o</task-id>\n<tool-use-id>${TU}</tool-use-id>\n<output-file>/tmp/x.output</output-file>\n<status>completed</status>\n<summary>Background agent "Recon prepaid-mode touchpoints" completed</summary>\n</task-notification>`;
mm.convertHistory([{ type: 'user', message: { role: 'user', content: NOTIF } }]);
ok('the persisted <task-notification> user record closes it (status + summary captured)', toolMsg.taskInfo.status === 'completed' && /Recon prepaid-mode/.test(toolMsg.taskInfo.summary || ''), JSON.stringify(toolMsg.taskInfo));

// Workflow lifecycle end-to-end
const TUW = 'toolu_wf001';
const mm2 = createMessageManager('claude', 'test-wf');
mm2.convertHistory([
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: TUW, name: 'Workflow', input: { script: 'export const meta = {}' } }] } },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: TUW, content: 'Workflow "audit" started.\nRun ID: wf_zz9' }] } },
]);
const wfMsg = mm2.messages.find((m) => m.content?.[0]?.toolCallId === TUW);
ok('a Workflow run gets the same lifecycle (running, id=runId → joins the tasks tracker)', wfMsg?.taskInfo?.status === 'running' && wfMsg.taskInfo.type === 'workflow' && wfMsg.taskInfo.id === 'wf_zz9', JSON.stringify(wfMsg?.taskInfo || null));

// ── wiring pins (2.355.0 lesson) ──
const ss = read('src/session-store.js');
ok('session-store taskState scan uses the SAME parser (no twin)', /require\('\.\/message-manager\.js'\)/.test(ss) && /parseBackgroundLaunch\(lu\.name, lu\.input, txt\)/.test(ss));
ok('phantom cut: a synthesized running task launched BEFORE the current wrapper start is dropped (an OS task cannot outlive the CLI process)', /tk\.status === 'running' && tk\._launchTs && tk\._launchTs < wStart\) delete tasks\[tuid\]/.test(ss));
ok('…and closes from persisted <task-notification> records with summary', /<task-notification>/.test(ss) && /tasks\[tu\]\.summary = sm\.slice\(0, 200\)/.test(ss));
const cr = read('src/lib/chat-renderers.js');
// the chip is ONE helper since 2026-09-21 (taskStatusChipHtml: running ⟳ / soft `finished` / err), called by BOTH cards
ok('Agent + Workflow cards show the lifecycle chip (the ONE taskStatusChipHtml helper, two call sites) and prefer the completion summary', /const taskStatusChipHtml = \(ti\) =>/.test(cr) && (cr.match(/taskStatusChipHtml\(/g) || []).length === 2 && (cr.match(/chat-task-status-chip/g) || []).length >= 3 && /ti\?\.summary/.test(cr) && /tiW\?\.summary/.test(cr));
const sb = read('src/lib/chat-status-bar.js');
ok('multiple running workflows COLLAPSE into one chip with a dropdown (like tasks)', /chat-status-wf-multi/.test(sb) && /\{count\} workflows/.test(sb) && /wfMulti && this\._workflows\?\.size/.test(sb));
ok('single-workflow chip keeps direct click-through', /wfChip\.dataset\.wfRun\) \{/.test(sb));


// ── 2.368.31 (owner: "又开始出现大量已经完成的任务显示成在进行了"): a BUSY
// agent's completions never become idle user records — the transcript shape
// is queue-operation(enqueue/remove) + attachment(queued_command), with the
// notification in `content` / `attachment.prompt` (real shapes, line 174031-
// 174035 of the field transcript; 17 phantom-running reproduced pre-fix, 1
// genuinely-running post-fix). One closer over all three transports.
{
  const TU3 = 'toolu_01TuKzJyPtagbRZj2BJCAXSE';
  const NOTIF3 = `<task-notification>\n<task-id>btxb9zfrd</task-id>\n<tool-use-id>${TU3}</tool-use-id>\n<status>completed</status>\n<summary>Background command "Production build in background" completed (exit code 0)</summary>\n</task-notification>`;
  const mkHist = () => ([
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: TU3, name: 'Bash', input: { command: 'npm run build', run_in_background: true, description: 'Production build in background' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: TU3, content: 'Command running in background with ID: btxb9zfrd. Output is being written to: /tmp/x.output' }] } },
  ]);
  // transport 1: queue-operation enqueue (completion while BUSY, delivery pending)
  const mq = createMessageManager('claude', 't-q');
  mq.convertHistory([...mkHist(), { type: 'queue-operation', operation: 'enqueue', content: NOTIF3 }]);
  const tmq = mq.messages.find((m) => m.content?.[0]?.toolCallId === TU3);
  ok('a queue-operation record CLOSES the task (completion while the agent was busy)', tmq?.taskInfo?.status === 'completed' && /Production build/.test(tmq.taskInfo.summary || ''), JSON.stringify(tmq?.taskInfo));
  // transport 2: queued_command attachment (the delivered copy)
  const ma = createMessageManager('claude', 't-a');
  ma.convertHistory([...mkHist(), { type: 'attachment', attachment: { type: 'queued_command', prompt: NOTIF3 } }]);
  const tma = ma.messages.find((m) => m.content?.[0]?.toolCallId === TU3);
  ok('a queued_command attachment closes it too…', tma?.taskInfo?.status === 'completed');
  const card = ma.messages.find((m) => m.originKind === 'task-notification');
  ok("…and renders a NOTIFICATION card, never a 'You' bubble of XML (provenance law)", !!card && !card.typed);
  // supersede: a Workflow resumed under the same run id closes the original card
  const mw = createMessageManager('claude', 't-w');
  mw.convertHistory([
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_w1', name: 'Workflow', input: { script: 'x' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_w1', content: 'Run ID: wf_768b7abd-f61' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_w2', name: 'Workflow', input: { resumeFromRunId: 'wf_768b7abd-f61' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_w2', content: 'Run ID: wf_768b7abd-f61' }] } },
  ]);
  const w1 = mw.messages.find((m) => m.content?.[0]?.toolCallId === 'toolu_w1');
  const w2 = mw.messages.find((m) => m.content?.[0]?.toolCallId === 'toolu_w2');
  ok('a resume under the SAME run id SUPERSEDES the original launch card (the wf_768b7abd residual)', w1?.taskInfo?.status === 'completed' && w2?.taskInfo?.status === 'running', JSON.stringify([w1?.taskInfo?.status, w2?.taskInfo?.status]));
  // wiring pins
  const ss3 = read('src/session-store.js');
  ok('the scan reads all three notification transports', /queue-operation' && typeof msg\.content === 'string'/.test(ss3) && /attachment' && typeof msg\.attachment\?\.prompt === 'string'/.test(ss3));
  ok('taskState MERGES wrapper live tasks over scanned history — never fallback (one live entry used to hide the whole set)', /tasks: \{ \.\.\.scanned\.tasks, \.\.\.base\.tasks \}/.test(ss3));
}


// ── LIVE WORKFLOW DETAIL (2.369.118): the task_progress tree survives heartbeats, field-wise ──
{
  const { normalizeWorkflowProgress } = require(path.join(REPO, "src/message-manager.js"));
  const TREE = [
    { type: "workflow_phase", index: 0, title: "Scan" }, { type: "workflow_phase", index: 1, title: "Repair" },
    { type: "workflow_agent", index: 0, label: "scan:a", phaseIndex: 0, phaseTitle: "Scan", agentId: "aaa111", model: "claude-fable-5-1", state: "done", startedAt: 1789635311282, attempt: 1, lastToolName: "Grep", lastToolSummary: "grep -n foo", promptPreview: "SECRET PROMPT TEXT ".repeat(40) },
    { type: "workflow_agent", index: 1, label: "repair:<b>x</b>", phaseIndex: 1, phaseTitle: "Repair", agentId: "bbb222", model: "claude-fable-5-1", state: "running", attempt: 2, lastToolName: "Bash", lastToolSummary: "npm test" },
  ];
  const wf = normalizeWorkflowProgress(TREE);
  ok("normalizeWorkflowProgress: phases + agents, prompt preview DROPPED, fields bounded", wf && wf.phases.length === 2 && wf.agents.length === 2 && !("promptPreview" in wf.agents[0]) && wf.agents[1].state === "running" && wf.agents[1].attempt === 2 && wf.agents[0].lastToolSummary === "grep -n foo", JSON.stringify(wf));
  ok("a heartbeat payload (no tree / empty / not an array) normalizes to null so the caller keeps its tree", normalizeWorkflowProgress(undefined) === null && normalizeWorkflowProgress([]) === null && normalizeWorkflowProgress("x") === null && normalizeWorkflowProgress([{ type: "other" }]) === null);
  const big = normalizeWorkflowProgress(Array.from({ length: 260 }, (_, i) => ({ type: "workflow_agent", index: i, label: "L".repeat(500), state: "queued" })));
  ok("agents are capped at 200 and labels at 80 chars", big.agents.length === 200 && big.agents[0].label.length === 80);
  const mm3 = createMessageManager("claude", "test-wf-live");
  mm3.convertHistory([
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_wf_live", name: "Workflow", input: { script: "export const meta = {}" } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_wf_live", content: "Workflow \"audit\" started.\nRun ID: wf_live1" }] } },
  ]);
  const edits = [];
  mm3.onChange = (e) => edits.push(e);
  const liveMsg = mm3.messages.find((m) => m.content?.[0]?.toolCallId === "toolu_wf_live");
  mm3.processLive({ type: "system", subtype: "task_started", task_id: "wf_live1", tool_use_id: "toolu_wf_live", task_type: "local_workflow", description: "audit" });
  mm3.processLive({ type: "system", subtype: "task_progress", task_id: "wf_live1", tool_use_id: "toolu_wf_live", description: "audit", usage: { total_tokens: 1105301, tool_uses: 262, duration_ms: 2122694 }, last_tool_name: "Bash", workflow_progress: TREE });
  ok("a task_progress with the tree lands on taskInfo.workflow + usage", liveMsg?.taskInfo?.workflow?.agents?.length === 2 && liveMsg.taskInfo.usage.totalTokens === 1105301 && liveMsg.taskInfo.usage.toolUses === 262 && liveMsg.taskInfo.lastTool === "Bash", JSON.stringify(liveMsg?.taskInfo));
  mm3.processLive({ type: "system", subtype: "task_progress", task_id: "wf_live1", tool_use_id: "toolu_wf_live", description: "audit", usage: { total_tokens: 1200000, tool_uses: 270, duration_ms: 2200000 } });
  ok("a HEARTBEAT without the tree keeps the tree and refreshes usage (field-wise latest value)", liveMsg.taskInfo.workflow.agents.length === 2 && liveMsg.taskInfo.usage.totalTokens === 1200000, JSON.stringify(liveMsg.taskInfo));
  mm3.processLive({ type: "system", subtype: "task_progress", task_id: "wf_live1", tool_use_id: "toolu_wf_live", description: "audit", workflow_progress: [TREE[0], TREE[1], { ...TREE[2] }, { ...TREE[3], state: "done" }] });
  ok("a later tree REPLACES the held one (running → done)", liveMsg.taskInfo.workflow.agents[1].state === "done");
  // renderer + wiring pins
  const cr = read("src/lib/chat-renderers.js"), cv = read("src/lib/chat-view.js"), css = read("public/chat.css");
  ok("chat-renderers renders phases + agent chips (label · state dot · last tool) from taskInfo.workflow, every string escaped", /workflowLiveHtml\(ti\)/.test(cr) && /class=\"chat-wf-agent\" data-state=\"\$\{escHtml\(st\)\}\"/.test(cr) && /\$\{escHtml\(a\.label \|\| a\.agentId \|\| \x27\?\x27\)\}/.test(cr) && /\$\{wfLiveHtml\}<details/.test(cr));
  ok("chat-view re-renders a WORKFLOW tool card on its taskInfo edit through _swapMessageEl (agent cards excluded — their live line is drawn elsewhere)", /fields\.taskInfo\.type === \x27workflow\x27 && msg\.role === \x27tool\x27[\s\S]{0,400}_swapMessageEl\(oldEl, newEl, id\)/.test(cv));
  ok("chat.css styles the chips with theme vars (dot by state)", /\.chat-wf-agent\[data-state="running"\] \.chat-wf-dot \{ background: var\(--accent\)/.test(css) && /\.chat-wf-agent\[data-state="error"\] \.chat-wf-dot \{ background: var\(--red/.test(css));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
