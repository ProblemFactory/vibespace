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
// 2.369.136 (owner: "这个workflow没有展示正确的名称"): a scriptPath launch has no
// input.name and its ack carries the run's description on a "Summary:" line
// (verbatim ack shape from a real launch on 2026-09-21) — that line is the name.
const SCRIPTPATH_ACK = 'Workflow launched in background. Task ID: w6v2xvee7\nSummary: inc-mubu23bd-5vxi: the CLI rate_limit_event type seven_day_overage_included is the PER-MODEL weekly bucket (Fable), not the plan 7d — the capture wrote 86% into the plan lane.\nTranscript dir: /home/u/.claude/projects/x/subagents/workflows/wf_f1347581-5e6\nScript file: /tmp/vs-work/weekly-lanes-wf.js\n(Edit this file with Write/Edit and re-invoke Workflow with {scriptPath: "/tmp/vs-work/weekly-lanes-wf.js"} to iterate without resending the script.)\nRun ID: wf_f1347581-5e6\nTo resume after editing the script: Workflow({scriptPath: "/tmp/vs-work/weekly-lanes-wf.js", resumeFromRunId: "wf_f1347581-5e6"})';
const p2b = parseBackgroundLaunch('Workflow', { scriptPath: '/tmp/vs-work/weekly-lanes-wf.js' }, SCRIPTPATH_ACK);
ok('a scriptPath launch ack → the Summary line names the run: the chip gets the SHORT id-like head, the whole line rides `summary` (never the bare "workflow" placeholder)', p2b && p2b.id === 'wf_f1347581-5e6' && p2b.description === 'inc-mubu23bd-5vxi' && p2b.summary.startsWith('inc-mubu23bd-5vxi: the CLI rate_limit_event type') && p2b.description !== 'workflow', JSON.stringify(p2b));
const { shortWorkflowName } = require('../src/workflow-name.js');
ok('shortWorkflowName: a short name stays whole; a prose description is cut at its first clause or a word boundary ≤ 60 chars; an id-like head wins', shortWorkflowName('fix-weekly-lanes') === 'fix-weekly-lanes' && shortWorkflowName('B-22ba: P8-2 of docs/design-desktop-apps.zh.md — the xpra seamless rung end-to-end (per-window)') === 'B-22ba' && shortWorkflowName('the desktop paste button gets a way out, a workflow chip shows the run name, and the sidebar hides its search') .length <= 61, JSON.stringify([shortWorkflowName('B-22ba: P8-2 of docs — x'), shortWorkflowName('the desktop paste button gets a way out, a workflow chip shows the run name, and the sidebar hides its search')]));
const p2c = parseBackgroundLaunch('Workflow', { script: "export const meta = {\n  name: 'fix-weekly-lanes',\n  description: 'x',\n}\nphase('Build')" }, 'Workflow launched in background. Task ID: t1\nRun ID: wf_inline-1');
ok('an inline script with no Summary line → meta.name', p2c && p2c.description === 'fix-weekly-lanes', JSON.stringify(p2c));
const p2d = parseBackgroundLaunch('Workflow', { scriptPath: '/tmp/vs-work/xpra-p82-wf.js' }, 'Workflow launched in background. Task ID: t2\nRun ID: wf_path-1');
ok('a scriptPath launch with no Summary line → the script basename (pre-fix control: "workflow")', p2d && p2d.description === 'xpra-p82-wf', JSON.stringify(p2d));
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
  // 2.369.147 r3 (owner: the View Workflow window said "valid runId required"): on a rebuild the ACK is in the
  // transcript and task_started is REPLAYED after it — the replay must MERGE (keep the wf_ run id as runId, the
  // summary, the ack's type), never replace the card's taskInfo with the CLI's short id
  const mr = createMessageManager('claude', 't-merge');
  mr.convertHistory([
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_m1', name: 'Workflow', input: { script: 'x' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_m1', content: 'Workflow launched in background. Task ID: sh0rt1d\nSummary: B-1: the lane\nRun ID: wf_merge-1' }] } },
  ]);
  mr.replay({ type: 'system', subtype: 'task_started', task_id: 'sh0rt1d', tool_use_id: 'toolu_m1', description: 'B-1', task_type: 'local_workflow', is_backgrounded: true, uuid: 'ms1', session_id: 's' });
  const mc = mr.messages.find((m) => m.content?.[0]?.toolCallId === 'toolu_m1');
  ok('a replayed task_started MERGES into the ack-synthesized card: id = the CLI short id, runId = the ack\'s wf_ id, summary and type kept', mc?.taskInfo?.id === 'sh0rt1d' && mc.taskInfo.runId === 'wf_merge-1' && mc.taskInfo.summary === 'B-1: the lane' && mc.taskInfo.type === 'workflow' && mc.taskInfo.status === 'running', JSON.stringify(mc?.taskInfo));
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
  mm3.onOp((e) => edits.push(e));
  const liveMsg = mm3.messages.find((m) => m.content?.[0]?.toolCallId === "toolu_wf_live");
  mm3.processLive({ type: "system", subtype: "task_started", task_id: "wf_live1", tool_use_id: "toolu_wf_live", task_type: "local_workflow", description: "audit" });
  ok("the CLI's `local_workflow` task_type is normalized to 'workflow' on the card (2.369.139, inc-muc1hfeg-0qn2: the live re-render gate compared 'local_workflow' with 'workflow' and dropped every task_progress until a reload)", liveMsg?.taskInfo?.type === 'workflow' && edits.some((e) => e.op === 'edit' && e.fields?.taskInfo?.type === 'workflow'), JSON.stringify(liveMsg?.taskInfo));
  mm3.processLive({ type: "system", subtype: "task_progress", task_id: "wf_live1", tool_use_id: "toolu_wf_live", description: "audit", usage: { total_tokens: 1105301, tool_uses: 262, duration_ms: 2122694 }, last_tool_name: "Bash", workflow_progress: TREE });
  ok("a task_progress with the tree lands on taskInfo.workflow + usage", liveMsg?.taskInfo?.workflow?.agents?.length === 2 && liveMsg.taskInfo.usage.totalTokens === 1105301 && liveMsg.taskInfo.usage.toolUses === 262 && liveMsg.taskInfo.lastTool === "Bash", JSON.stringify(liveMsg?.taskInfo));
  mm3.processLive({ type: "system", subtype: "task_progress", task_id: "wf_live1", tool_use_id: "toolu_wf_live", description: "audit", usage: { total_tokens: 1200000, tool_uses: 270, duration_ms: 2200000 } });
  ok("a HEARTBEAT without the tree keeps the tree and refreshes usage (field-wise latest value)", liveMsg.taskInfo.workflow.agents.length === 2 && liveMsg.taskInfo.usage.totalTokens === 1200000, JSON.stringify(liveMsg.taskInfo));
  mm3.processLive({ type: "system", subtype: "task_progress", task_id: "wf_live1", tool_use_id: "toolu_wf_live", description: "audit", workflow_progress: [TREE[0], TREE[1], { ...TREE[2] }, { ...TREE[3], state: "done" }] });
  ok("a later tree REPLACES the held one (running → done)", liveMsg.taskInfo.workflow.agents[1].state === "done");
  // LIVE ORDER (the incident's exact shape): the tool_use streams, task_started lands with the CLI's
  // `local_workflow` BEFORE the tool_result ack, then task_progress carries the tree — every edit op
  // must already say 'workflow' (the client gate) and the ack's runId still registers
  {
    const mm4 = createMessageManager("claude", "test-wf-live");
    const edits4 = []; mm4.onOp((e) => edits4.push(e));
    mm4.processLive({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_wf_order", name: "Workflow", input: { scriptPath: "/tmp/x/lane-wf.js" } }] } });
    mm4.processLive({ type: "system", subtype: "task_started", task_id: "wu9order1", tool_use_id: "toolu_wf_order", task_type: "local_workflow", description: "lane" });
    const cardMsg = mm4.messages.find((m) => m.content?.[0]?.toolCallId === "toolu_wf_order");
    const firstType = edits4.find((e) => e.op === 'edit' && e.fields?.taskInfo)?.fields?.taskInfo?.type;
    ok("live order: task_started before the ack — the first taskInfo edit already carries type 'workflow' (pre-fix: 'local_workflow', the gate dropped it)", firstType === 'workflow' && cardMsg?.taskInfo?.type === 'workflow', JSON.stringify({ firstType, ti: cardMsg?.taskInfo }));
    mm4.processLive({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_wf_order", content: "Workflow launched in background. Task ID: wu9order1\nSummary: lane: the thing\nRun ID: wf_order-1" }] } });
    mm4.processLive({ type: "system", subtype: "task_progress", task_id: "wu9order1", tool_use_id: "toolu_wf_order", description: "Build: b1", workflow_progress: TREE });
    ok("…the ack registers the wf_ run id and a later task_progress edit carries the tree with type 'workflow'", cardMsg?.taskInfo?.runId === 'wf_order-1' && cardMsg.taskInfo.type === 'workflow' && cardMsg.taskInfo.workflow?.agents?.length === 2 && edits4.filter((e) => e.fields?.taskInfo?.workflow).every((e) => e.fields.taskInfo.type === 'workflow'), JSON.stringify(cardMsg?.taskInfo).slice(0, 300));
  }
  // REPLAY AFTER A RESTART (2.369.140, inc-muc2fmtt-5jat): the server persists the latest
  // task_started / task_progress (tree kept) / task_notification per task and replays them
  // SILENTLY after the history rebuild — the card gets its tree back with zero ops emitted
  {
    const { taskReplayRecords } = require('../src/normalizers.js');
    const mm5 = createMessageManager("claude", "test-wf-replay");
    mm5.convertHistory([
      { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_wf_rep", name: "Workflow", input: { scriptPath: "/tmp/x/lane-wf.js" } }] } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_wf_rep", content: "Workflow launched in background. Task ID: wu9rep1\nSummary: lane: replay\nRun ID: wf_rep-1" }] } },
    ]);
    const ops5 = []; mm5.onOp((e) => ops5.push(e));
    const persisted = { toolu_wf_rep: { started: { type: "system", subtype: "task_started", task_id: "wu9rep1", tool_use_id: "toolu_wf_rep", task_type: "local_workflow", description: "lane" },
      progress: { type: "system", subtype: "task_progress", task_id: "wu9rep1", tool_use_id: "toolu_wf_rep", description: "Build: b1", usage: { total_tokens: 5, tool_uses: 1, duration_ms: 9 }, workflow_progress: TREE }, at: 1 } };
    const recs = taskReplayRecords(persisted);
    ok("taskReplayRecords orders started → progress (→ notification) per task", recs.length === 2 && recs[0].subtype === 'task_started' && recs[1].subtype === 'task_progress');
    for (const r of recs) mm5.replay(r);
    const card5 = mm5.messages.find((m) => m.content?.[0]?.toolCallId === "toolu_wf_rep");
    ok("after the silent replay the card carries the tree, type 'workflow', running — and NO op was emitted (a rebuild has no client yet)", card5?.taskInfo?.workflow?.agents?.length === 2 && card5.taskInfo.type === 'workflow' && card5.taskInfo.status === 'running' && ops5.length === 0, JSON.stringify({ ti: card5?.taskInfo, ops: ops5.length }).slice(0, 300));
    mm5.replay({ type: "system", subtype: "task_notification", task_id: "wu9rep1", tool_use_id: "toolu_wf_rep", status: "completed", summary: "done" });
    ok("a replayed notification closes it (completed) — still silently", card5.taskInfo.status === 'completed' && ops5.length === 0, JSON.stringify(card5.taskInfo).slice(0, 200));
  }
  // renderer + wiring pins
  const cr = read("src/lib/chat-renderers.js"), cv = read("src/lib/chat-view.js"), css = read("public/chat.css");
  const sb = read("src/lib/chat-status-bar.js");
  ok("the status bar's single-task chip shows shortWorkflowName(description) (2.369.141: a Workflow's task description is its whole meta.description)", /import \{ shortWorkflowName \} from '\.\.\/workflow-name\.js'/.test(sb) && /shortWorkflowName\(this\._bgTasks\[0\]\.description\)/.test(sb) && /shortWorkflowName\(tasks\[0\]\.description\)/.test(sb));
  ok("chat-renderers renders phases + agent chips (label · state dot · last tool) from taskInfo.workflow, every string escaped; the chip's state AND the tally read the ONE vocabulary mapping (workflowAgentState)", /renderWorkflowLive\(ti\)/.test(cr) && /class=\"chat-wf-agent\" data-state=\"\$\{escHtml\(st\)\}\"/.test(cr) && /\$\{escHtml\(a\.label \|\| a\.agentId \|\| \x27\?\x27\)\}/.test(cr) && /\$\{wfLiveHtml\}<details/.test(cr) && /const st = workflowAgentState\(a\.state\);/.test(cr) && /const states = wf\.agents\.map\(\(a\) => workflowAgentState\(a\.state\)\);/.test(cr));
    ok("chat-view PATCHES a WORKFLOW tool card in place on its taskInfo edit (inc-mudv05ja-n5rv: _scheduleWorkflowPatch → _patchWorkflowCard, no swap; agent cards excluded — their live line is drawn elsewhere; a card the renderer draws no Workflow result for — pending, error — is left alone); the gate also admits any card that carries the tree", /\(fields\.taskInfo\.type === \x27workflow\x27 \|\| fields\.taskInfo\.workflow\) && msg\.role === \x27tool\x27\) \{\n\s*this\._scheduleWorkflowPatch\(id\);/.test(cv) && /if \(!this\._renderers\.drawsWorkflowCard\(msg\)\) return;/.test(cv));
  ok("chat.css styles the chips with theme vars (dot by state)", /\.chat-wf-agent\[data-state="running"\] \.chat-wf-dot \{ background: var\(--accent\)/.test(css) && /\.chat-wf-agent\[data-state="error"\] \.chat-wf-dot \{ background: var\(--red/.test(css));
}

// ── THE LIVE CARD IS PATCHED IN PLACE, NEVER SWAPPED, WHILE THE RUN IS LIVE (inc-mudv05ja-n5rv) ──
// Owner: "the chat window's content flickers as if it refreshes" while a Workflow runs.
// Every `task_progress` (several per second on a multi-agent run) became a taskInfo edit,
// and chat-view re-rendered the WHOLE Workflow card and swapped the element — label, View
// Workflow button, both <details> (an opened Script snapped shut), the phase tree and every
// agent chip re-created, a running chip's infinite pulse restarted. Driven here end to end:
// the REAL normalizer's ops (JSON round-tripped like the websocket) into the REAL
// ChatView._onEditMessage (→ _scheduleWorkflowPatch → _patchWorkflowCard), the REAL
// renderers and the REAL status bar, over a mini DOM that PARSES the renderer's markup (so
// the patched card can be compared to a fresh render). Ported from the parallel lane
// (fix-inc-mudv05ja-card) onto the in-place patcher that shipped, legs adapted to its names.
{
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-wfcard-'));
  // build-version.js is GENERATED by `npm run build` (gitignored) — stubbed so the leg runs on a fresh checkout
  const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
  const TAIL = "\nexport { ChatRenderers } from './chat-renderers.js';\nexport * as renderersModule from './chat-renderers.js';\nexport { ChatStatusBar } from './chat-status-bar.js';\n";
  const bundle = async (name, chatViewSource) => {
    const out = path.join(tmp, name + '.mjs');
    await esbuild.build({ stdin: { contents: chatViewSource + TAIL, resolveDir: path.join(REPO, 'src/lib'), sourcefile: name + '.js', loader: 'js' }, bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'error', loader: { '.css': 'text' }, plugins: [stubBuildVersion] });
    return out;
  };
  const cvSrc = read('src/lib/chat-view.js');
  // THE NEGATIVE CONTROL: the same ChatView with the taskInfo branch put back to the pre-fix
  // statement VERBATIM (every Workflow taskInfo edit re-renders the card through the swap point)
  const FIXED_BRANCH = /(msg\.role === 'tool'\) \{\n)(\s*)this\._scheduleWorkflowPatch\(id\);\n/;
  const neutered = cvSrc.replace(FIXED_BRANCH, (_, head, ind) => `${head}${ind}const oldEl = this._elements.get(id);\n${ind}if (oldEl) { try { const newEl = this._renderers.renderToolMsg(msg); if (newEl) this._swapMessageEl(oldEl, newEl, id); } catch { /* the status bar already has it */ } }\n`);
  ok('the negative control applies (the fixed branch is found and replaced by the pre-fix statement)', neutered !== cvSrc && neutered.includes("if (oldEl) { try { const newEl = this._renderers.renderToolMsg(msg); if (newEl) this._swapMessageEl(oldEl, newEl, id); } catch"));
  // import BEFORE the fake document exists: the module tree wires DOM-dependent helpers only when one is present
  const fixedMod = await import(await bundle('chat-view-under-test', cvSrc));
  const preFixMod = await import(await bundle('chat-view-pre-fix', neutered));

  // ── THE CLI's OWN WORDS (the renderer's ONE mapping, table-tested before any DOM exists) ──
  {
    const m = fixedMod.renderersModule.workflowAgentState;
    const table = [['start', 'running'], ['progress', 'running'], ['running', 'running'], ['done', 'done'], ['error', 'error'], ['queued', 'queued'], ['skipped', 'skipped'], [undefined, 'queued'], [null, 'queued'], ['', 'queued']];
    const bad = typeof m === 'function' ? table.filter(([i, o]) => m(i) !== o) : table;
    ok("workflowAgentState: the CLI's working words start / progress (and the fixture's running) draw as `running`; done / error / queued / skipped / absent keep their word", typeof m === 'function' && bad.length === 0, JSON.stringify(bad.map(([i, o]) => [i, o, typeof m === 'function' ? m(i) : 'no workflowAgentState export'])));
  }

  // ── the MINI DOM: parse + serialize + a selector subset (incl. `:scope`), templates, and a
  //    WRITE counter that counts mutations of the DOCUMENT (a detached parse is not a write) ──
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m)));
  const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const W = { writes: 0 }; // every mutation of a node attached to the document
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  const camel = (a) => a.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  class MNode {
    constructor() { this.parentNode = null; }
    get parentElement() { const p = this.parentNode; return p && p.nodeType === 1 ? p : null; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === ROOT; }
    get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
    get previousSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] || null : null; }
    get nextElementSibling() { let n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceWith(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this); p.removeChild(this); }
    after(n) { const p = this.parentNode; if (p) p.insertBefore(n, this.nextSibling); }
  }
  class MText extends MNode {
    constructor(d) { super(); this.nodeType = 3; this._d = String(d); }
    get data() { return this._d; } set data(v) { this._d = String(v); if (this.isConnected) W.writes++; }
    get nodeValue() { return this._d; } set nodeValue(v) { this.data = v; }
    get textContent() { return this._d; } set textContent(v) { this.data = v; }
    get outerHTML() { return escText(this._d); }
    cloneNode() { return new MText(this._d); }
  }
  const SEL_PART = /(:scope)|([.#])([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]|^([a-zA-Z*][\w-]*)/g;
  const compound = (s) => { const c = { tag: null, id: null, scope: false, cls: [], attrs: [] }; let m; SEL_PART.lastIndex = 0;
    while ((m = SEL_PART.exec(s))) { if (m[1]) c.scope = true; else if (m[8]) c.tag = m[8].toLowerCase(); else if (m[2] === '.') c.cls.push(m[3]); else if (m[2] === '#') c.id = m[3]; else if (m[4]) c.attrs.push([m[4], m[5] ?? m[6] ?? m[7] ?? null]); }
    return c; };
  const parseSel = (sel) => sel.split(',').map((alt) => { const out = []; let comb = ' ';
    for (const tok of alt.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/)) { if (tok === '>') { comb = '>'; continue; } out.push({ comb, c: compound(tok) }); comb = ' '; }
    return out; });
  const matchC = (el, c, scope) => el.nodeType === 1 && (!c.scope || el === scope) && (!c.tag || c.tag === '*' || el.localName === c.tag) && (!c.id || el.getAttribute('id') === c.id)
    && c.cls.every((k) => el.classList.contains(k)) && c.attrs.every(([a, v]) => (v === null ? el.hasAttribute(a) : el.getAttribute(a) === v));
  const matchChain = (el, chain, scope, i = chain.length - 1) => {
    if (!matchC(el, chain[i].c, scope)) return false;
    if (i === 0) return true;
    if (chain[i].comb === '>') return !!el.parentNode && el.parentNode.nodeType === 1 && matchChain(el.parentNode, chain, scope, i - 1);
    for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (matchChain(p, chain, scope, i - 1)) return true;
    return false;
  };
  class MEl extends MNode {
    constructor(tag) {
      super(); this.nodeType = 1; this.localName = String(tag).toLowerCase(); this.tagName = this.localName.toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.style = {};
      const self = this;
      this.dataset = new Proxy({}, {
        get: (_, k) => (typeof k === 'string' ? (self.getAttribute('data-' + kebab(k)) ?? undefined) : undefined),
        set: (_, k, v) => { self.setAttribute('data-' + kebab(k), v); return true; },
        deleteProperty: (_, k) => { self.removeAttribute('data-' + kebab(k)); return true; },
        has: (_, k) => self.hasAttribute('data-' + kebab(String(k))),
        ownKeys: () => [...self.attrs.keys()].filter((a) => a.startsWith('data-')).map(camel),
        getOwnPropertyDescriptor: (_, k) => (self.hasAttribute('data-' + kebab(String(k))) ? { enumerable: true, configurable: true, value: self.getAttribute('data-' + kebab(String(k))) } : undefined),
      });
      const cl = () => (self.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      this.classList = {
        contains: (c) => cl().includes(c),
        add: (...cs) => { const s = cl(); let ch = false; for (const c of cs) if (!s.includes(c)) { s.push(c); ch = true; } if (ch) self.setAttribute('class', s.join(' ')); },
        remove: (...cs) => { const s = cl(); const n = s.filter((c) => !cs.includes(c)); if (n.length !== s.length) self.setAttribute('class', n.join(' ')); },
        toggle: (c, force) => { const has = cl().includes(c); const want = force === undefined ? !has : !!force; if (want && !has) self.classList.add(c); else if (!want && has) self.classList.remove(c); return want; },
      };
    }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); if (this.isConnected) W.writes++; }
    removeAttribute(k) { if (this.attrs.delete(k) && this.isConnected) W.writes++; }
    hasAttribute(k) { return this.attrs.has(k); }
    get className() { return this.getAttribute('class') || ''; } set className(v) { this.setAttribute('class', v); }
    get title() { return this.getAttribute('title') || ''; } set title(v) { this.setAttribute('title', v); }
    get id() { return this.getAttribute('id') || ''; } set id(v) { this.setAttribute('id', v); }
    get open() { return this.hasAttribute('open'); } set open(v) { if (v) this.setAttribute('open', ''); else this.removeAttribute('open'); }
    get content() { return this; } // <template>: its parsed children ARE the content here
    get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    get firstChild() { return this.childNodes[0] || null; }
    cloneNode(deep) { const c = new MEl(this.localName); for (const [k, v] of this.attrs) c.attrs.set(k, v); if (deep) for (const n of this.childNodes) c.appendChild(n.cloneNode(true)); return c; }
    appendChild(n) { return this.insertBefore(n, null); }
    append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new MText(n) : n); }
    prepend(...ns) { const f = this.firstChild; for (const n of ns) this.insertBefore(typeof n === 'string' ? new MText(n) : n, f); }
    insertBefore(n, ref) {
      if (n.nodeType === 11) { for (const c of [...n.childNodes]) this.insertBefore(c, ref); return n; }
      if (ref && ref.parentNode !== this) throw new Error('insertBefore: the reference is not a child');
      if (n.parentNode) n.parentNode.removeChild(n);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
      n.parentNode = this; if (this.isConnected) W.writes++; return n;
    }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i < 0) throw new Error('removeChild: not a child'); const conn = this.isConnected; this.childNodes.splice(i, 1); n.parentNode = null; if (conn) W.writes++; return n; }
    get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== '' && v != null) this.appendChild(new MText(v)); }
    get innerHTML() { return this.childNodes.map((n) => n.outerHTML).join(''); }
    set innerHTML(h) { for (const c of [...this.childNodes]) this.removeChild(c); parseInto(this, String(h)); }
    get outerHTML() {
      const a = [...this.attrs].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
      return VOID.has(this.localName) ? `<${this.localName}${a}>` : `<${this.localName}${a}>${this.innerHTML}</${this.localName}>`;
    }
    insertAdjacentHTML(pos, html) {
      const box = new MEl('div'); parseInto(box, String(html));
      const nodes = [...box.childNodes];
      const p = pos.toLowerCase();
      if (p === 'beforeend') for (const n of nodes) this.appendChild(n);
      else if (p === 'afterbegin') { const f = this.firstChild; for (const n of nodes) this.insertBefore(n, f); }
      else if (p === 'beforebegin') for (const n of nodes) this.parentNode.insertBefore(n, this);
      else if (p === 'afterend') { const nx = this.nextSibling; for (const n of nodes) this.parentNode.insertBefore(n, nx); }
    }
    querySelectorAll(sel) { const chains = parseSel(sel), out = []; const walk = (el) => { for (const c of el.children) { if (chains.some((ch) => matchChain(c, ch, this))) out.push(c); walk(c); } }; walk(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    matches(sel) { return parseSel(sel).some((ch) => matchChain(this, ch, this)); }
    closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(sel)) return n; return null; }
    addEventListener() {} removeEventListener() {} focus() {} blur() {}
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  }
  function parseInto(parent, html) {
    const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|([^<]+|<)/g;
    const stack = [parent]; let m;
    while ((m = re.exec(html))) {
      const top = stack[stack.length - 1];
      if (m[0].startsWith('<!--')) continue;
      if (m[1]) { const tag = m[1].toLowerCase(); for (let i = stack.length - 1; i > 0; i--) if (stack[i].localName === tag) { stack.length = i; break; } continue; }
      if (m[2]) {
        const el = new MEl(m[2]);
        const ar = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g; let a;
        while ((a = ar.exec(m[3]))) el.attrs.set(a[1], decode(a[2] ?? a[3] ?? a[4] ?? ''));
        top.appendChild(el);
        if (!m[4] && !VOID.has(el.localName)) stack.push(el);
        continue;
      }
      top.appendChild(new MText(decode(m[5])));
    }
  }
  const ROOT = new MEl('html');
  const rafQ = [];
  const flushFrame = () => { const q = rafQ.splice(0); for (const f of q) f(performance.now()); return q.length; };
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const noop = () => {};
  const g = { document: { createElement: (t) => new MEl(t), createTextNode: (t) => new MText(t), createDocumentFragment: () => { const f = new MEl('#fragment'); f.nodeType = 11; return f; }, getElementById: () => null, body: ROOT, documentElement: ROOT, head: new MEl('head'), addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], hidden: false },
    requestAnimationFrame: (f) => { rafQ.push(f); return rafQ.length; }, cancelAnimationFrame: noop, addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), getComputedStyle: () => ({ getPropertyValue: () => '' }), innerWidth: 1280, innerHeight: 800,
    location: { origin: 'http://test', href: 'http://test/', hostname: 'test', protocol: 'http:' }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop } };
  for (const [k, v] of Object.entries(g)) { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch { } }
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.CSS) globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };

  // ── the fixture: the REAL live order (tool_use → task_started with the CLI's `local_workflow`
  //    → the launch ack → task_progress), agent states in the CLI's OWN vocabulary
  //    (start / progress / done / error — measured on 8 production buffers: 161 progress,
  //    26 start, 253 done, 56 error, ZERO 'running') ──
  const TUID = 'toolu_wf_blink';
  const agent = (i, label, phaseIndex, state, tool, extra = {}) => ({ type: 'workflow_agent', index: i, label, phaseIndex, phaseTitle: phaseIndex ? 'Verify' : 'Build', agentId: 'ag' + i + 'x'.repeat(8), model: 'claude-fable-5-1', state, startedAt: 1790153970608, attempt: 1, lastToolName: tool, lastToolSummary: tool ? tool.toLowerCase() + ' …' : undefined, ...extra });
  const PHASES = [{ type: 'workflow_phase', index: 0, title: 'Build' }, { type: 'workflow_phase', index: 1, title: 'Verify' }];
  const TOOLS = ['Bash', 'Read', 'Grep', 'Edit'];
  // tick k (0-based) of the 30: agent 1 is STEADY `progress` all along (its chip must stay the
  // SAME node — the one whose pulse a swap restarts); agent 0 finishes at tick 10; agent 2
  // starts at 5 and fails at 25; agent 3 appears at 15 (a new chip, appended in place)
  const treeAt = (k) => [...PHASES,
    agent(0, 'build:core', 0, k < 10 ? 'progress' : 'done', TOOLS[k % 4]),
    agent(1, 'build:<ui>', 0, 'progress', TOOLS[(k + 1) % 4]),
    agent(2, 'verify:regress', 1, k < 5 ? 'start' : k < 25 ? 'progress' : 'error', k < 5 ? undefined : TOOLS[(k + 2) % 4]),
    ...(k >= 15 ? [agent(3, 'verify:money', 1, 'progress', TOOLS[(k + 3) % 4])] : []),
  ];
  const progress = (k) => ({ type: 'system', subtype: 'task_progress', task_id: 'wu9blink1', tool_use_id: TUID, description: 'blink', usage: { total_tokens: 1000 * (k + 1), tool_uses: k + 1, duration_ms: 60000 * (k + 1) }, last_tool_name: TOOLS[k % 4], workflow_progress: treeAt(k) });
  // what a card DRAWS, as the browser paints it (runs of whitespace collapse): the label row,
  // the live tree and the ✓ outcome line — never the reader's <details> open state
  const drawn = (el) => { const tu = el?.querySelector('.chat-tool-use'); if (!tu) return ''; const sums = tu.querySelectorAll(':scope > details.chat-diff > summary.chat-diff-summary');
    return [tu.querySelector(':scope > .chat-tool-label')?.outerHTML || '', tu.querySelector(':scope > .chat-wf-live')?.outerHTML || '', sums[sums.length - 1]?.outerHTML || ''].join('\n').replace(/\s+/g, ' '); };

  const drive = async (mod) => {
    W.writes = 0;
    const list = new MEl('div'); list.className = 'chat-message-list'; ROOT.appendChild(list);
    const renderers = new mod.ChatRenderers({ ws: null, sessionId: 's-wf', app: {}, backend: 'claude', compact: false, messageList: list });
    // the two per-element affordance installers are orthogonal to this path (the _swapMessageEl harness in test-worktree-userchan-ui stubs them the same way)
    renderers.addWrapToggles = () => {}; renderers.addOpenInEditorBtn = () => {};
    const bar = new mod.ChatStatusBar({ send() {} }, 's-wf', { backend: 'claude', getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {} });
    bar._pollWorkflows = () => {}; // the ⛭ chip's /api/workflow poll — no server here
    const view = Object.assign(Object.create(mod.ChatView.prototype), {
      sessionId: 's-wf', _messages: [], _elements: new Map(), _renderers: renderers, _statusBar: bar, _messageList: list,
      _loadingHistory: false, _pinned: false, _disposed: false, _runExpanded: new Set(), _runStickyOpen: new Set(), _getSessionIds: () => ({ backend: 'claude' }),
    });
    const r = { view, list, bar, renderers, swaps: 0, patches: 0 };
    const realSwap = view._swapMessageEl;
    view._swapMessageEl = function (...a) { r.swaps++; return realSwap.apply(this, a); };
    const realPatch = view._patchWorkflowCard;
    if (typeof realPatch === 'function') view._patchWorkflowCard = function (...a) { r.patches++; return realPatch.apply(this, a); };
    const mm = createMessageManager('claude', 's-wf');
    mm.onOp((op0) => {
      const op = JSON.parse(JSON.stringify(op0)); // the websocket hop — every edit arrives as a NEW object
      if (op.op === 'create' && op.message?.role === 'tool') {
        view._messages.push(op.message);
        const el = renderers.renderToolMsg(op.message);
        if (el) { el.dataset.msgId = op.message.id; list.appendChild(el); view._elements.set(op.message.id, el); }
      } else if (op.op === 'create' && op.message) view._messages.push(op.message);
      else if (op.op === 'edit') view._onEditMessage(op.id, op.fields);
    });
    r.feed = (raw) => mm.processLive(raw);
    // ONE patch PASS: the patcher's own cadence (one pass per frame, at most one per 150 ms per
    // view) — wait for its timer to fire, then run the frame it queued
    r.pass = async () => { for (let i = 0; i < 40 && view._wfPatchTimer; i++) await sleep(10); return flushFrame(); };
    r.cardId = () => view._messages.find((m) => m.content?.[0]?.toolCallId === TUID)?.id;
    r.card = () => view._elements.get(r.cardId());
    r.msg = () => view._messages.find((m) => m.id === r.cardId());
    r.fresh = () => r.renderers.renderToolMsg(JSON.parse(JSON.stringify(r.msg())));
    // a chip is found by its LABEL (its first text node) — the one fact both the pre-fix and the fixed markup carry
    r.chip = (label) => [...(r.card()?.querySelectorAll('.chat-wf-agent') || [])].find((c) => c.childNodes.find((n) => n.nodeType === 3)?.data === label) || null;
    await feedLaunch(r);
    return r;
  };
  const feedLaunch = async (r) => {
    r.feed({ type: 'assistant', message: { id: 'msg_wf', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: TUID, name: 'Workflow', input: { scriptPath: '/tmp/x/blink-wf.js' } }] }, uuid: 'a-wf', timestamp: new Date().toISOString() });
    r.feed({ type: 'system', subtype: 'task_started', task_id: 'wu9blink1', tool_use_id: TUID, task_type: 'local_workflow', description: 'blink', is_backgrounded: true });
    await r.pass();
    // the card is still the PENDING tool_call here: a fresh render draws nothing from taskInfo on it
    r.pendingDrawn = drawn(r.card()); r.pendingFresh = drawn(r.fresh()); r.pendingPatches = r.patches;
    r.feed({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: TUID, content: 'Workflow launched in background. Task ID: wu9blink1\nSummary: blink: the live card\nRun ID: wf_blink-1' }] }, uuid: 'r-wf', timestamp: new Date().toISOString() });
    r.feed(progress(0));
    await r.pass();
  };
  const liveOf = (el) => el?.querySelector('.chat-wf-live')?.outerHTML || '';

  const run = async (mod) => {
    const r = await drive(mod);
    const card0 = r.card(), chip1 = r.chip('build:<ui>'), dot1 = chip1?.querySelector('.chat-wf-dot');
    const launch = { chips: card0?.querySelectorAll('.chat-wf-agent').length || 0, runningChip: !!card0?.querySelector('.chat-task-status-chip'), live: liveOf(card0), pendingDrawn: r.pendingDrawn, pendingFresh: r.pendingFresh };
    const barChips0 = r.bar.element.children.slice(), barHtml0 = barChips0.map((el) => el.innerHTML);
    const script = card0?.querySelector('details'); if (script) script.open = true; // the reader opened the Script
    const swaps0 = r.swaps, patches0 = r.patches; let passes = 0;
    for (let k = 1; k <= 30; k++) { r.feed(progress(k)); if (k % 3 === 0) { await r.pass(); passes++; } }
    const after = { card: r.card(), chip1: r.chip('build:<ui>'), swaps: r.swaps - swaps0, passes, patches: r.patches - patches0, launch };
    after.inList = after.card === card0 && card0.parentNode === r.list;
    after.dot1 = after.chip1?.querySelector('.chat-wf-dot');
    after.scriptOpen = !!after.card?.querySelector('details')?.open;
    after.live = liveOf(after.card);
    after.fresh = liveOf(r.fresh());
    after.parity = after.live === after.fresh && after.live !== '';
    after.barSame = r.bar.element.children.length === barChips0.length && r.bar.element.children.every((el, i) => el === barChips0[i] && el.innerHTML === barHtml0[i]);
    after.barKeys = barChips0.map((el) => el.getAttribute('data-chip')).join(',');
    // a no-change update: the same tree again touches nothing (compare before writing)
    r.feed(progress(30)); await r.pass();
    const w0 = W.writes; r.feed(progress(30)); await r.pass();
    after.noChangeWrites = W.writes - w0;
    // the OUTCOME: a terminal notification is applied to the SAME card in ONE pass — the ⟳
    // running chip goes and the card draws exactly what a fresh render of the terminal
    // message draws
    const beforeEnd = r.card(), swapsBeforeEnd = r.swaps, patchesBeforeEnd = r.patches;
    const hadChip = !!beforeEnd?.querySelector('.chat-task-status-chip');
    r.feed({ type: 'system', subtype: 'task_notification', task_id: 'wu9blink1', tool_use_id: TUID, status: 'completed', summary: 'done' });
    await r.pass();
    after.end = { same: r.card() === beforeEnd && r.card()?.parentNode === r.list, swaps: r.swaps - swapsBeforeEnd, patches: r.patches - patchesBeforeEnd,
      chipGone: hadChip && !r.card()?.querySelector('.chat-task-status-chip'), drawn: drawn(r.card()), fresh: drawn(r.fresh()), scriptOpen: !!r.card()?.querySelector('details')?.open };
    return { r, card0, chip1, dot1, after };
  };

  const { r, card0, chip1, dot1, after } = await run(fixedMod);
  ok('the launch renders ONE Workflow card with the live tree (fixture sanity: 3 agents, the ⟳ running chip)', after.launch.chips === 3 && after.launch.runningChip && !!chip1, after.launch.live.slice(0, 200));
  ok('a PENDING Workflow tool_call is left alone by its task_started taskInfo edit — it draws exactly what a fresh render of it draws (no ⟳ chip, no tree: the pending card reads nothing from taskInfo)', r.pendingDrawn !== '' && r.pendingDrawn === r.pendingFresh && !/chat-task-status-chip|chat-wf-live/.test(r.pendingDrawn), `patched: ${r.pendingDrawn.slice(0, 300)}\n      fresh:   ${r.pendingFresh.slice(0, 300)}`);
  ok('(a) 30 task_progress edits leave the card the SAME element, still in the list, with ZERO swaps (pre-fix: one whole-card swap per edit)', after.inList && after.swaps === 0, JSON.stringify({ same: after.card === card0, inList: after.inList, swaps: after.swaps }));
  ok('(b) the chip that stayed live throughout is the SAME node, and so is its dot (an infinite animation restarts only on a new element) — drawn `running` from the CLI\'s `progress`', !!chip1 && after.chip1 === chip1 && after.dot1 === dot1 && chip1.getAttribute('data-state') === 'running', JSON.stringify({ sameChip: after.chip1 === chip1, sameDot: after.dot1 === dot1, state: chip1?.getAttribute('data-state') }));
  ok('(c) the patched tree is EXACTLY what a fresh render of the last edit draws (states, labels, last tools, the new chip, tally, usage)', after.parity, `patched: ${after.live.slice(0, 400)}\n      fresh:   ${after.fresh.slice(0, 400)}`);
  ok("(c) …the CLI's live words (start / progress) draw as the card's `running` — its pulse and the tally's running count exist in production (0 'running' among 496 real agent records)", /data-state="done"[^>]*>(?:<[^>]*>)*build:core/.test(after.live) && /data-state="error"/.test(after.live) && (after.live.match(/data-state="running"/g) || []).length === 2 && /1\/4 · 1 failed · 2 running/.test(after.live), after.live.slice(0, 600));
  ok('(c) N edits inside one pass ⇒ ONE patch (coalesced per message id, one pass per frame / 150 ms): 30 edits over 10 passes = 10 patches', after.passes === 10 && after.patches === after.passes, JSON.stringify({ patches: after.patches, passes: after.passes }));
  ok('(c) a no-change update touches NOTHING in the document (compare before writing)', after.noChangeWrites === 0, `writes: ${after.noChangeWrites}`);
  ok("(c) the reader's opened Script <details> stays open across the run (a swap re-created it closed)", after.scriptOpen === true);
  ok('(d) the OUTCOME: a terminal task_notification is applied to the SAME card in ONE pass (0 swaps, 1 patch) — the ⟳ running chip is gone, the Script stays open', after.end.same && after.end.swaps === 0 && after.end.patches === 1 && after.end.chipGone && after.end.scriptOpen, JSON.stringify({ ...after.end, drawn: undefined, fresh: undefined }));
  ok('(d) …and the patched card draws exactly what a fresh render of the terminal message draws (the label row without the ⟳ chip, the tree, the ✓ line)', after.end.drawn === after.end.fresh && after.end.drawn !== '' && !/chat-task-status-chip/.test(after.end.drawn), `patched: ${after.end.drawn.slice(0, 500)}\n      fresh:   ${after.end.fresh.slice(0, 500)}`);
  ok(`the status bar side rebuilds nothing per progress: every chip (${after.barKeys}) is the same node with the same markup across the 30 edits (keyed since a3)`, after.barSame && /tasks/.test(after.barKeys) && /wf/.test(after.barKeys));
  // XSS: agent-authored strings reach the tree through BOTH paths — a NEW chip / phase is built from the
  // escaped markup, an EXISTING chip's label / tool is replaced in place — and neither parses a tag
  {
    const EVIL = '<img src=x onerror=alert(1)>';
    const msgX = r.msg();
    const tiX = JSON.parse(JSON.stringify(msgX.taskInfo));
    tiX.workflow.agents[0].label = EVIL; tiX.workflow.agents[1].lastToolName = EVIL;
    tiX.workflow.agents.push({ index: 9, label: EVIL, phaseIndex: 7, phaseTitle: EVIL, agentId: 'evil', state: 'progress', lastToolName: EVIL });
    msgX.taskInfo = tiX;
    const chip0 = r.card().querySelector('.chat-wf-agent');
    const w0 = W.writes;
    r.view._patchWorkflowCard(r.cardId());
    const liveX = r.card().querySelector('.chat-wf-live');
    ok('XSS: a hostile label / tool / phase title arriving by patch — in place AND as a new chip / phase — never becomes a tag', W.writes > w0 && !!liveX && liveX.querySelectorAll('img').length === 0 && (liveX.textContent.split(EVIL).length - 1) >= 4 && r.card().querySelector('.chat-wf-agent') === chip0 && liveOf(r.card()) === liveOf(r.fresh()), liveOf(r.card()).slice(0, 300));
  }

  // THE NEGATIVE CONTROL, run through the SAME drive: the pre-fix branch swaps the card on every
  // progress tick — (a) and (b) above must FAIL there, or they measure nothing
  {
    const c = await run(preFixMod);
    ok('NEGATIVE CONTROL (pre-fix branch): the same 30 edits replace the card 30 times and re-create the steady chip and its dot — (a)/(b) fail on the old code, so they measure the fix', c.after.swaps === 30 && !c.after.inList && c.after.chip1 !== c.chip1 && c.after.dot1 !== c.dot1 && c.after.patches === 0, JSON.stringify({ swaps: c.after.swaps, inList: c.after.inList, patches: c.after.patches }));
    ok("NEGATIVE CONTROL: …and the reader's opened Script <details> is shut by the swap (the owner's 'as if it refreshes')", c.after.scriptOpen === false);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
