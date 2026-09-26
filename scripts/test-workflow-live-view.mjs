#!/usr/bin/env node
// ONE LIVE VIEW FOR THE CARD AND THE WINDOW (2.369.119, owner: "怎么这个内外实现还不一样？"):
// the chat card rendered phases/labels live from the CLI's task_progress tree
// while the View Workflow window showed "(agent)" placeholders until the run
// finished. PURE src/workflow-live.js lays the tree over the disk skeleton by
// agentId; /api/workflow wraps EVERY live branch with it; the window renders
// what it gets. Run: node scripts/test-workflow-live-view.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { mergeLiveWorkflow, windowState } = require(path.join(REPO, 'src/workflow-live.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));

console.log('§1 the merge: tree over skeleton, by agentId');
const skeleton = { runId: 'wf_x', status: 'running', live: true, agentCount: 3, doneCount: 1, totalTokens: 0, totalToolCalls: 0, durationMs: 0,
  phases: [{ index: 0, title: 'Agents (live — …)', agents: [
    { index: 0, label: '', model: '', state: 'done', agentId: 'aaa111' },
    { index: 0, label: '', model: '', state: 'superseded', agentId: 'bbb222' },
    { index: 0, label: '', model: '', state: 'progress', agentId: 'ddd444' }, // on disk, the tree has not named it yet
  ] }] };
const tree = { phases: [{ index: 0, title: 'Scan' }, { index: 1, title: 'Repair' }], agents: [
  { index: 0, label: 'scan:a', phaseIndex: 0, phaseTitle: 'Scan', agentId: 'aaa111', model: 'claude-fable-5-1', state: 'done', lastToolName: 'Grep' },
  { index: 1, label: 'repair:b', phaseIndex: 1, phaseTitle: 'Repair', agentId: 'bbb222', model: 'claude-fable-5-1', state: 'running', lastToolName: 'Bash', lastToolSummary: 'npm test', attempt: 1 },
  { index: 2, label: 'repair:c', phaseIndex: 1, phaseTitle: 'Repair', agentId: 'ccc333', model: 'claude-fable-5-1', state: 'running', lastToolName: 'Edit' }, // named by the tree, no transcript yet
  { index: 3, label: 'repair:q', phaseIndex: 1, agentId: null, state: 'queued' },
] };
const usage = { totalTokens: 1105301, toolUses: 262, durationMs: 2122694 };
const m = mergeLiveWorkflow(skeleton, tree, usage);
ok('no tree ⇒ the skeleton is returned untouched (a window after the launching session is gone)', mergeLiveWorkflow(skeleton, null, null) === skeleton && mergeLiveWorkflow(skeleton, { agents: [] }, null) === skeleton);
ok('phases come from the tree in index order, plus a trailing "Agents" phase for disk-only agents', m.liveTree === true && m.phases.map((p) => p.title).join('|') === 'Scan|Repair|Agents', m.phases.map((p) => p.title));
const byId = Object.fromEntries(m.phases.flatMap((p) => p.agents).map((a) => [a.agentId || 'null', a]));
ok('labels, model and last tool ride the tree; a done agent is done', byId.aaa111.label === 'scan:a' && byId.aaa111.model === 'claude-fable-5-1' && byId.aaa111.state === 'done' && byId.aaa111.onDisk === true);
ok('the JOURNAL\'s retry verdict wins over the tree: a superseded attempt stays superseded even while the tree says running', byId.bbb222.state === 'superseded' && byId.bbb222.lastToolName === 'Bash');
ok('a tree-named agent with no transcript yet is listed, running, onDisk false (View Log disabled), last tool shown', byId.ccc333.state === 'progress' && byId.ccc333.onDisk === false && byId.ccc333.lastToolName === 'Edit');
ok('a queued agent without an id is listed as queued', byId.null.state === 'queued' && byId.null.label === 'repair:q');
ok('the disk-only agent keeps its journal state under the trailing phase', m.phases[2].agents[0].agentId === 'ddd444' && m.phases[2].agents[0].state === 'progress' && m.phases[2].agents[0].onDisk === true);
ok('counts and usage are recomputed from the merged view', m.agentCount === 5 && m.doneCount === 1 && m.totalTokens === 1105301 && m.totalToolCalls === 262 && m.durationMs === 2122694, { a: m.agentCount, d: m.doneCount });
ok('windowState maps the tree vocabulary onto the window\'s (running→progress; error stays error even when the journal said done)', windowState('running', null) === 'progress' && windowState('error', 'done') === 'error' && windowState('done', null) === 'done' && windowState('queued', null) === 'queued' && windowState(undefined, 'done') === 'done' && windowState(undefined, null) === 'progress');
const untouched = JSON.stringify(skeleton);
mergeLiveWorkflow(skeleton, tree, usage);
ok('the merge never mutates its inputs', JSON.stringify(skeleton) === untouched);

console.log('§2 the normalizer exposes the live task by its run id');
{
  // THE REAL LIVE ORDER (2.369.122, owner "这个还是没同步啊" on a .120 instance): the CLI
  // emits system/task_started with a SHORT task_id ('wu93ghxi2' in a real buffer)
  // BEFORE the tool_result that carries the ack "Run ID: wf_…" — the earlier
  // fixture put the ack first and used the run id as task_id, which is not a
  // shape the wire ever produces (the fixtures-from-real-data rule).
  const mm = createMessageManager('claude', 'test-wf-live-view');
  mm.processLive({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_wf_lv', name: 'Workflow', input: { script: 'export const meta = {}' } }] } });
  mm.processLive({ type: 'system', subtype: 'task_started', task_id: 'wu93ghxi2', tool_use_id: 'toolu_wf_lv', task_type: 'local_workflow', description: 'audit' });
  mm.processLive({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_wf_lv', content: 'Workflow "audit" started in the background.\nRun ID: wf_lv1\nUse /workflows to watch.' }] } });
  mm.processLive({ type: 'system', subtype: 'task_progress', task_id: 'wu93ghxi2', tool_use_id: 'toolu_wf_lv', description: 'audit', usage: { total_tokens: 10, tool_uses: 2, duration_ms: 3000 }, workflow_progress: [{ type: 'workflow_phase', index: 0, title: 'Scan' }, { type: 'workflow_agent', index: 0, label: 'scan:a', phaseIndex: 0, agentId: 'aaa111', state: 'running' }] });
  const ti = mm.taskInfoById('wf_lv1');
  ok('taskInfoById(RUN id) resolves even though task_started (short task_id) landed before the ack — the run id is registered from the ack and remembered as taskInfo.runId', ti && ti.workflow && ti.workflow.agents.length === 1 && ti.usage.totalTokens === 10 && ti.id === 'wu93ghxi2' && ti.runId === 'wf_lv1', ti);
  ok('the short task id still resolves (the CLI\'s own key for task_progress/notification)', mm.taskInfoById('wu93ghxi2') === ti);
  ok('an unknown run id answers null', mm.taskInfoById('wf_nope') === null && mm.taskInfoById(undefined) === null);
}
{
  // THE SET NAMES A CARD, NOT A KEY (lane Q verify, 2026-09-26): the real order above leaves the
  // card with TWO keys (the short task id + the wf_ run id the ack registered); the CLI's
  // background_tasks_changed names only the SHORT one. Judged per key, the run-id key was "not
  // named" and soft-closed the card the short key kept open — every level set closed a running
  // Workflow and /api/workflow stopped counting its tree (a live run read Stalled after 10 quiet min).
  const judge = (MM) => {
    const mm = MM ? new MM('test-wf-levelset') : createMessageManager('claude', 'test-wf-levelset');
    mm.processLive({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_wf_ls', name: 'Workflow', input: { script: 'export const meta = {}' } }] } });
    mm.processLive({ type: 'system', subtype: 'task_started', task_id: 'wu9ls1', tool_use_id: 'toolu_wf_ls', task_type: 'local_workflow', description: 'audit', is_backgrounded: true });
    mm.processLive({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_wf_ls', content: 'Workflow "audit" started in the background.\nRun ID: wf_ls1\nUse /workflows to watch.' }] } });
    mm.processLive({ type: 'system', subtype: 'task_progress', task_id: 'wu9ls1', tool_use_id: 'toolu_wf_ls', description: 'audit', workflow_progress: [{ type: 'workflow_phase', index: 0, title: 'Scan' }, { type: 'workflow_agent', index: 0, label: 'scan:a', phaseIndex: 0, agentId: 'aaa111', state: 'running' }] });
    mm.processLive({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'wu9ls1', task_type: 'local_workflow', description: 'audit' }] });
    const named = { ...mm.taskInfoById('wf_ls1') };
    mm.processLive({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    const dropped = { ...mm.taskInfoById('wf_ls1') };
    return { named, dropped };
  };
  const real = judge(null);
  ok('a level set naming ONLY the short task id keeps the Workflow card running (resolved by either key) — the run-id key is the SAME card, never "not named"', real.named.status === 'running' && real.named.closedBy === undefined && real.named.runId === 'wf_ls1', real.named);
  ok('…a set that names neither key still soft-closes it (finished, closedBy level) — the rule is per CARD, not disabled', real.dropped.status === 'finished' && real.dropped.closedBy === 'level', real.dropped);
  // NEGATIVE CONTROL: the pre-fix per-KEY loops, spelled verbatim, in a patched copy of the normalizer
  const M = mutantCopies('workflow-live-view', REPO);
  const src = read('src/message-manager.js');
  const from = src.indexOf('      // THE SET NAMES A CARD, NOT A KEY'), to = src.indexOf("      if (emit) this._emit({ op: 'meta', subtype: 'background-tasks'");
  const PRE = `      const live = new Set(set.map((t) => t.id));
      for (const [tid, msgId] of this.taskMsgByTaskId) {
        if (!live.has(String(tid))) continue;
        const m = this.messageIndex.get(msgId);
        if (m?.taskInfo && m.taskInfo.status === 'finished' && m.taskInfo.closedBy === 'level') {
          m.taskInfo.status = 'running'; delete m.taskInfo.closedBy;
          if (emit) this._emit({ op: 'edit', id: m.id, fields: { taskInfo: m.taskInfo } });
        }
      }
      for (const [tid, msgId] of this.taskMsgByTaskId) {
        if (live.has(String(tid))) continue;
        const m = this.messageIndex.get(msgId);
        if (m?.taskInfo && m.taskInfo.status === 'running' && m.taskInfo.backgrounded === true) {
          m.taskInfo.status = 'finished';
          m.taskInfo.closedBy = 'level';
          if (emit) this._emit({ op: 'edit', id: m.id, fields: { taskInfo: m.taskInfo } });
        }
      }
`;
  ok('the control applies (the per-card section is found)', from > 0 && to > from);
  const pre = M.load('src/message-manager.js', src.slice(0, from) + PRE + src.slice(to), 'perkey');
  const ctl = judge(pre.MessageManager);
  ok(`CONTROL: the pre-fix per-KEY loops close the card through its run-id key (status ${ctl.named.status}, closedBy ${ctl.named.closedBy}) — the leg sees the defect`, ctl.named.status === 'finished' && ctl.named.closedBy === 'level', ctl.named);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(r.name, r.pass, r.detail);
}

console.log('§3 wiring pins (the 2.355.0 lesson)');
{
  const route = read('src/routes/sessions.js');
  // 2026-09-26: every live return goes through ONE seam, liveView — parseRunDir
  // (src/workflow-disk.js) over the run dir's parts, the tree merged over it.
  // The old skeleton helpers are gone; a return that builds its own view is a miss.
  const body = route.slice(route.indexOf("router.get('/api/workflow'"), route.indexOf("router.post('/api/session-rescue'"));
  const liveReturns = (body.match(/return res\.json\(liveView\(/g) || []).length;
  const seam = route.slice(route.indexOf('function liveView('), route.indexOf('function readRunDirParts('));
  ok(`every live-view return of /api/workflow goes through liveView (${liveReturns} sites: local no-snapshot + resumed, remote no-snapshot + resumed); parseRunDir is called ONLY inside it and the tree is merged there`,
    liveReturns === 4 && (route.match(/parseRunDir\(/g) || []).length === 1 && /parseRunDir\(/.test(seam) && /mergeLiveWorkflow\(view, ti\.workflow/.test(seam)
    && !/liveWorkflowFromParts|readLiveWorkflow|withLiveTree/.test(route) && /require\('\.\.\/workflow-live'\)/.test(route) && /n\.taskInfoById\(runId\)/.test(route), { liveReturns });
  const win = read('src/lib/workflow-detail.js');
  ok('the window renders the tree: liveTree note (the PURE liveNoteKind picks it, the stall first — lane Q verify), live tokens/tool calls, the last-tool chip, View Log disabled for a transcript not on disk yet', /noteKind === 'tree'\s*\?/.test(win) && /const noteKind = liveNoteKind\(wf\)/.test(win) && /wf\.liveTree && wf\.totalTokens/.test(win) && /workflow-agent-tool/.test(win) && /ag\.onDisk === false/.test(win) && /escHtml\(ag\.lastToolName\)/.test(win));
  ok('the chip is styled with theme vars', /\.workflow-agent-tool \{[^}]*var\(--text-dim\)/.test(read('public/style.css')));
  ok('the CLAUDE.md head no longer calls live progress unreadable', !/live progress is TUI-only, unreadable/.test(read('CLAUDE.md')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
