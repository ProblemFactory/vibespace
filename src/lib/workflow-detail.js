import { escHtml, showToast } from './utils.js';

/**
 * Workflow detail window (window type 'workflow') — POST-HOC viewer for a
 * dynamic-workflow (ultracode) run.
 *
 * A workflow writes ONE terminal-state snapshot when it finishes, at
 *   <projectDir>/<claudeSessionId>/workflows/wf_<runId>.json
 * (the rich phase/agent tree is NOT written live — live progress is a
 * TUI-only render layer, verified empirically). So this window shows a
 * COMPLETED (or killed/failed) run: phases → agents with per-agent state,
 * model and token totals. Each agent's transcript opens in the existing
 * read-only subagent viewer (server resolves the workflow-nested agent files).
 *
 * Entry: the "View Workflow" button on a Workflow tool card in chat.
 * openSpec 'openWorkflowDetail' persists it across restore / multi-client.
 */

const STATE_META = {
  done:     { label: 'done',     color: '#98c379' },
  progress: { label: 'running',  color: '#61afef' },
  queued:   { label: 'queued',   color: 'var(--text-dim)' },
  error:    { label: 'error',    color: '#e06c75' },
  skipped:  { label: 'skipped',  color: 'var(--text-dim)' },
};

const RUN_STATUS_META = {
  completed: { label: 'Completed', color: '#98c379' },
  running:   { label: 'Running',   color: '#61afef' },
  killed:    { label: 'Killed',    color: '#e5a04c' },
  failed:    { label: 'Failed',    color: '#e06c75' },
};

function fmtDuration(ms) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

export function openWorkflowDetail(app, runId, opts = {}) {
  const { claudeSessionId = '', cwd = '', name = '', syncId } = opts;

  const existing = [...app.wm.windows.values()].find(w => w._workflowRunId === runId);
  if (existing) { app.wm.focusWindow(existing.id); return existing; }

  const openSpec = { action: 'openWorkflowDetail', runId, claudeSessionId, cwd, name };
  const winInfo = app.wm.createWindow({
    title: name || 'Workflow', type: 'workflow', syncId, openSpec, width: 480, height: 560,
  });
  winInfo._workflowRunId = runId;

  const root = document.createElement('div');
  root.className = 'workflow-detail';
  root.innerHTML = '<div class="empty-hint">Loading workflow…</div>';
  winInfo.content.appendChild(root);

  // Dedup for agent-log viewers opened from this window
  const agentViewers = new Map(); // virtualId -> winId

  const openAgentLog = (agentId, label) => {
    if (!agentId) { showToast('This agent has no transcript on disk', { type: 'error' }); return; }
    const virtualId = `sub-agent-${agentId}`;
    const openWinId = agentViewers.get(virtualId);
    if (openWinId && app.wm.windows.has(openWinId)) { app.wm.focusWindow(openWinId); return; }
    // Reuse the standard read-only subagent viewer. Server resolves the
    // workflow-nested transcript by agentId (candidate list includes
    // subagents/workflows/wf_*/). No live parent — reads from disk.
    app.replayOpenSpec({
      action: 'viewSubagent',
      virtualId,
      parentSessionId: null,
      backend: 'claude',
      backendSessionId: claudeSessionId,
      claudeSessionId,
      cwd,
      agentKind: 'subagent',
      sourceKind: 'workflow',
      description: label || 'Workflow agent',
    });
    const w = [...app.wm.windows.values()].find(x => x._openSpec?.virtualId === virtualId);
    if (w) agentViewers.set(virtualId, w.id);
  };

  const render = (wf) => {
    app.wm.setTitle(winInfo.id, wf.workflowName || name || 'Workflow');
    root.innerHTML = '';

    // ── Header ──
    const head = document.createElement('div');
    head.className = 'workflow-detail-head';
    const st = RUN_STATUS_META[wf.status] || { label: wf.status || '?', color: 'var(--text-dim)' };
    head.innerHTML =
      `<div class="workflow-detail-title">${escHtml(wf.workflowName || 'Workflow')}</div>` +
      `<span class="workflow-status-chip" style="--chip-color:${st.color}">${escHtml(st.label)}</span>`;
    root.appendChild(head);

    if (wf.summary) {
      const sum = document.createElement('div');
      sum.className = 'workflow-detail-summary';
      sum.textContent = wf.summary;
      root.appendChild(sum);
    }

    // ── Meta line ──
    const meta = document.createElement('div');
    meta.className = 'workflow-detail-meta';
    const bits = [
      `${wf.agentCount || 0} agents`,
      `${fmtTokens(wf.totalTokens)} tokens`,
      `${wf.totalToolCalls || 0} tool calls`,
    ];
    if (wf.durationMs) bits.push(fmtDuration(wf.durationMs));
    meta.textContent = bits.join(' · ');
    root.appendChild(meta);

    // ── Phases → agents ──
    for (const phase of wf.phases || []) {
      const sec = document.createElement('div');
      sec.className = 'workflow-phase';
      const doneN = phase.agents.filter(a => a.state === 'done').length;
      const hdr = document.createElement('div');
      hdr.className = 'workflow-phase-head';
      hdr.innerHTML =
        `<span class="workflow-phase-title">${escHtml(phase.title)}</span>` +
        `<span class="workflow-phase-count">${doneN}/${phase.agents.length}</span>`;
      sec.appendChild(hdr);

      for (const ag of phase.agents) {
        const sm = STATE_META[ag.state] || { label: ag.state || '?', color: 'var(--text-dim)' };
        const row = document.createElement('div');
        row.className = 'workflow-agent-row';
        const model = ag.model ? ag.model.replace(/^claude-/, '') : '';
        row.innerHTML =
          `<span class="workflow-agent-state" style="--chip-color:${sm.color}" title="${escHtml(sm.label)}"></span>` +
          `<span class="workflow-agent-label">${escHtml(ag.label || '(agent)')}</span>` +
          (model ? `<span class="workflow-agent-model">${escHtml(model)}</span>` : '');
        const btn = document.createElement('button');
        btn.className = 'workflow-agent-view-btn';
        btn.textContent = 'View Log';
        btn.disabled = !ag.agentId;
        btn.title = ag.agentId ? 'Open this agent’s transcript' : 'No transcript on disk';
        btn.onclick = () => openAgentLog(ag.agentId, ag.label);
        row.appendChild(btn);
        sec.appendChild(row);
      }
      root.appendChild(sec);
    }

    // ── Result / error ──
    if (wf.error) {
      const box = document.createElement('details');
      box.className = 'workflow-detail-box workflow-detail-error';
      box.innerHTML = `<summary>Error</summary><pre>${escHtml(wf.error)}</pre>`;
      root.appendChild(box);
    } else if (wf.result) {
      const box = document.createElement('details');
      box.className = 'workflow-detail-box';
      box.innerHTML = `<summary>Result</summary><pre>${escHtml(wf.result)}</pre>`;
      root.appendChild(box);
    }
  };

  const load = async () => {
    const q = new URLSearchParams({ runId });
    if (claudeSessionId) q.set('claudeSessionId', claudeSessionId);
    if (cwd) q.set('cwd', cwd);
    try {
      const res = await fetch(`/api/workflow?${q}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        root.innerHTML = `<div class="empty-hint">${escHtml(body.error || 'Workflow snapshot not found.')}<br><span class="workflow-hint-sub">The snapshot is written when the run finishes.</span></div>`;
        return;
      }
      render(await res.json());
    } catch (e) {
      root.innerHTML = `<div class="empty-hint">Failed to load workflow: ${escHtml(e.message)}</div>`;
    }
  };
  load();

  winInfo.onClose = () => app._checkWelcome();
  return winInfo;
}
