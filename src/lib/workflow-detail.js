import { escHtml, showToast } from './utils.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { stallWords, liveNoteKind } from '../workflow-disk.js'; // PURE: the ONE spelling of a stalled run (the chat card's chip reads it too) + which note a live view carries (the stall first)

/**
 * Workflow detail window (window type 'workflow') — POST-HOC viewer for a
 * dynamic-workflow (ultracode) run.
 *
 * A workflow writes ONE terminal-state snapshot when it finishes, at
 *   <projectDir>/<claudeSessionId>/workflows/wf_<runId>.json
 * — phases → agents with per-agent state, model and token totals. Before
 * that (or when the run stopped without one) the server reads the run DIR
 * (src/workflow-disk.js): labels, phases and states from the journal + the
 * agents' meta files, and a liveness verdict from the files' mtimes — a run
 * nothing has written to for 10 minutes is `stalled`, never "running"; the
 * launching session's live progress tree is laid over it while this server
 * holds one. Each agent's transcript opens in the existing read-only subagent
 * viewer (server resolves the workflow-nested agent files).
 *
 * Entry: the "View Workflow" button on a Workflow tool card in chat.
 * openSpec 'openWorkflowDetail' persists it across restore / multi-client.
 */

// Theme vars, not palette hexes — these render on all 6 themes + custom ones.
const STATE_META = {
  done:     { label: t('done'),     color: 'var(--green, #98c379)' },
  progress: { label: t('running'),  color: 'var(--blue, #61afef)' },
  queued:   { label: t('queued'),   color: 'var(--text-dim)' },
  error:    { label: t('error'),    color: 'var(--red, #e55)' },
  skipped:  { label: t('skipped'),  color: 'var(--text-dim)' },
  // a retry replaced this attempt (its log ends in an aborted request) —
  // without the label these read as mysterious user interrupts (real report)
  superseded: { label: t('retried — replaced by a newer attempt'), color: 'var(--text-dim)' },
  // an agent of a STALLED run with no result: it is not running either
  unfinished: { label: t('unfinished — the run stopped before it returned'), color: 'var(--yellow, #e5a04c)' },
};

const RUN_STATUS_META = {
  completed: { label: t('Completed'), color: 'var(--green, #98c379)' },
  running:   { label: t('Running'),   color: 'var(--blue, #61afef)' },
  killed:    { label: t('Killed'),    color: 'var(--yellow, #e5a04c)' },
  failed:    { label: t('Failed'),    color: 'var(--red, #e55)' },
  // no result, no terminal snapshot, no file written for 10 minutes (src/workflow-disk.js)
  stalled:   { label: t('Stalled'),   color: 'var(--yellow, #e5a04c)' },
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
  const { claudeSessionId = '', cwd = '', name = '', host = '', syncId } = opts;

  const existing = [...app.wm.windows.values()].find(w => w._workflowRunId === runId);
  if (existing) { app.wm.focusWindow(existing.id); return existing; }

  // host = the machine holding the run's artifacts (remote session, 2.191.0)
  const openSpec = { action: 'openWorkflowDetail', runId, claudeSessionId, cwd, name, ...(host ? { host } : {}) };
  const winInfo = app.wm.createWindow({
    title: name || 'Workflow', type: 'workflow', syncId, openSpec, width: 480, height: 560,
  });
  winInfo._workflowRunId = runId;

  const root = document.createElement('div');
  root.className = 'workflow-detail';
  root.innerHTML = `<div class="empty-hint">${escHtml(t('Loading workflow…'))}</div>`;
  winInfo.content.appendChild(root);

  // Dedup for agent-log viewers opened from this window
  const agentViewers = new Map(); // virtualId -> winId

  const openAgentLog = (agentId, label) => {
    if (!agentId) { showToast(t('This agent has no transcript on disk'), { type: 'error' }); return; }
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
      ...(host ? { hostId: host } : {}), // remote run → transcript fetched from the host
      agentKind: 'subagent',
      sourceKind: 'workflow',
      description: label || 'Workflow agent',
    });
    const w = [...app.wm.windows.values()].find(x => x._openSpec?.virtualId === virtualId);
    if (w) agentViewers.set(virtualId, w.id);
  };

  // DIGEST-GATED, IN PLACE (inc-mudv05ja-n5rv): the 2.5 s live poll used to
  // `root.innerHTML = ''` and rebuild the whole window on every tick — the
  // pulsing `.workflow-status-live` chip re-created (its animation restarted =
  // a 2.5 s blink), every View Log button re-created under the pointer, an open
  // Result/Error expander closed, and the first render's title change rebuilt
  // the taskbar. Now: an unchanged run is not rendered at all; the head (title
  // + status chip) is built ONCE and updated in place; agent rows are keyed by
  // agentId and updated in place; `<details>` keep their open state.
  let lastDigest = '';
  let lastTitle = null;
  let head = null, headTitle = null, headChip = null, body = null;
  const rows = new Map(); // agent key -> { row, sig }
  const render = (wf) => {
    if (head && !head.isConnected) lastDigest = '';   // an error / loading line replaced the view: the next answer renders
    // a stalled run's sentence carries a relative time ("12 min ago") — part of
    // the digest, so the words follow the clock while nothing else changed
    const stall = stallWords(wf, { t, now: Date.now() });
    const digest = JSON.stringify(wf) + (stall ? '|' + stall.detail : '');
    if (digest === lastDigest) return;
    lastDigest = digest;
    const title = wf.workflowName || name || 'Workflow';
    if (title !== lastTitle) { lastTitle = title; app.wm.setTitle(winInfo.id, title); }

    // ── Header (built once; class/text/colour updated in place) ──
    if (!head || !head.isConnected) {
      root.innerHTML = '';
      head = document.createElement('div');
      head.className = 'workflow-detail-head';
      headTitle = document.createElement('div');
      headTitle.className = 'workflow-detail-title';
      headChip = document.createElement('span');
      head.append(headTitle, headChip);
      body = document.createElement('div');
      body.className = 'workflow-detail-body';
      root.append(head, body);
      rows.clear();
    }
    const st = RUN_STATUS_META[wf.status] || { label: wf.status || '?', color: 'var(--text-dim)' };
    const wfTitle = wf.workflowName || 'Workflow';
    if (headTitle.textContent !== wfTitle) headTitle.textContent = wfTitle;
    // the pulse means RUNNING — a stalled run's disk view is live data, not a live run
    const chipCls = 'workflow-status-chip' + (wf.live && wf.status === 'running' ? ' workflow-status-live' : '');
    if (headChip.className !== chipCls) headChip.className = chipCls;
    if (headChip.style.getPropertyValue('--chip-color') !== st.color) headChip.style.setProperty('--chip-color', st.color);
    if (headChip.textContent !== st.label) headChip.textContent = st.label;
    const chipTip = stall ? stall.detail : '';
    if (headChip.title !== chipTip) headChip.title = chipTip;

    // the open state of every expander survives the rebuild of the body
    const openBoxes = new Set([...body.querySelectorAll('details.workflow-detail-box')].filter((d) => d.open).map((d) => d.dataset.box));
    const nextBody = document.createDocumentFragment();

    if (wf.summary) {
      const sum = document.createElement('div');
      sum.className = 'workflow-detail-summary';
      sum.textContent = wf.summary;
      nextBody.appendChild(sum);
    }

    // ── Meta line ──
    const meta = document.createElement('div');
    meta.className = 'workflow-detail-meta';
    let bits;
    if (wf.live) {
      bits = [t('{n} agents', { n: wf.agentCount || 0 }), t('{n} done', { n: wf.doneCount || 0 })];
      if (stall) { if (stall.detail) bits.push(stall.detail); } else bits.push(t('running…'));
      // the stream tree carries the run's own usage while it is live (2.369.119)
      if (wf.liveTree && wf.totalTokens) bits.push(t('{n} tokens', { n: fmtTokens(wf.totalTokens) }));
      if (wf.liveTree && wf.totalToolCalls) bits.push(t('{n} tool calls', { n: wf.totalToolCalls }));
      if (wf.resumed) bits.push(t('resumed after an interruption'));
    } else {
      bits = [t('{n} agents', { n: wf.agentCount || 0 }), t('{n} tokens', { n: fmtTokens(wf.totalTokens) }), t('{n} tool calls', { n: wf.totalToolCalls || 0 })];
      if (wf.durationMs) bits.push(fmtDuration(wf.durationMs));
    }
    meta.textContent = bits.join(' · ');
    nextBody.appendChild(meta);

    if (wf.live) {
      const note = document.createElement('div');
      // STALL FIRST (lane Q verify, 2026-09-26): a stalled view may still carry a
      // merged tree (the stream holds one, closed or stale) — its sentence must
      // agree with the chip, so the stall picks the note and the rail on its own
      // (PURE liveNoteKind, tabled in test-workflow-disk).
      const noteKind = liveNoteKind(wf);
      note.className = 'workflow-live-note' + (noteKind === 'stalled' ? ' workflow-live-note-stalled' : '');
      // 2.369.119: with the harness's own progress tree (the same one the chat
      // card renders) phases, labels and states are live. Without it (a window
      // opened after the launching session is gone, a server restart) the view
      // is the run DIR's (2026-09-26): labels and phases come from the run's
      // files too — only token totals wait for the run's end — and a run that
      // stopped writing says so instead of "running…" forever.
      note.textContent = noteKind === 'stalled'
        ? t('None of this run’s files has changed for over {n} minutes and it never wrote its final result — it most likely stopped together with the session that launched it. Open any agent to read its transcript.', { n: 10 })
        : noteKind === 'tree'
          ? t('Live view — phases, labels and states come from the run’s own progress records (the same ones the chat card shows); token totals are final when the run finishes.')
          : t('Live view from the run’s own files — agent states update every few seconds; token totals appear when the run finishes. Open any agent to watch its transcript.');
      nextBody.appendChild(note);
    }

    // ── Phases → agents (rows keyed by agentId, updated in place) ──
    const seen = new Set();
    for (const phase of wf.phases || []) {
      const sec = document.createElement('div');
      sec.className = 'workflow-phase';
      const doneN = phase.agents.filter(a => a.state === 'done').length;
      const hdr = document.createElement('div');
      hdr.className = 'workflow-phase-head';
      // a phase the run's files did not name (an untitled remainder) reads in the device's words
      const phaseTitle = phase.untitled ? (phase.title === 'Other' ? t('Other') : t('Agents')) : phase.title;
      hdr.innerHTML =
        // the full title on hover — a long one is clipped to an ellipsis (lane Q verify)
        `<span class="workflow-phase-title" title="${escHtml(phaseTitle)}">${escHtml(phaseTitle)}</span>` +
        `<span class="workflow-phase-count">${doneN}/${phase.agents.length}</span>`;
      sec.appendChild(hdr);

      phase.agents.forEach((ag, i) => {
        const key = ag.agentId ? 'a:' + ag.agentId : `p:${phase.index}:${i}`;
        seen.add(key);
        // a stalled run's agent with no result is `unfinished`, never "running"
        const shown = wf.status === 'stalled' && ag.state === 'progress' ? 'unfinished' : ag.state;
        const sm = STATE_META[shown] || { label: shown || '?', color: 'var(--text-dim)' };
        const model = ag.model ? ag.model.replace(/^claude-/, '') : '';
        const spans =
          `<span class="workflow-agent-state" aria-hidden="true" style="--chip-color:${sm.color}" title="${escHtml(sm.label)}"></span>` +
          // the full label on hover — a 500-char one is clipped to an ellipsis (lane Q verify)
          `<span class="workflow-agent-label"${ag.label ? ` title="${escHtml(ag.label)}"` : ''}>${escHtml(ag.label || '(agent)')}</span>` +
          (ag.lastToolName && (ag.state === 'progress' || ag.state === 'queued') ? `<span class="workflow-agent-tool" title="${escHtml(ag.lastToolSummary || ag.lastToolName)}">${escHtml(ag.lastToolName)}</span>` : '') +
          (model ? `<span class="workflow-agent-model">${escHtml(model)}</span>` : '');
        let rec = rows.get(key);
        if (!rec) {
          const row = document.createElement('div');
          row.className = 'workflow-agent-row';
          const btn = document.createElement('button');
          btn.className = 'workflow-agent-view-btn';
          btn.textContent = t('View Log');
          row.appendChild(btn);
          rec = { row, btn, sig: null };
          rows.set(key, rec);
        }
        if (rec.sig !== spans) {
          rec.sig = spans;
          while (rec.row.firstChild && rec.row.firstChild !== rec.btn) rec.row.firstChild.remove();
          rec.btn.insertAdjacentHTML('beforebegin', spans);
        }
        const disabled = !ag.agentId || ag.onDisk === false; // a tree-named agent whose transcript file has not appeared yet
        if (rec.btn.disabled !== disabled) rec.btn.disabled = disabled;
        const tip = !ag.agentId ? 'No transcript on disk' : (ag.onDisk === false ? t('No transcript on disk yet') : 'Open this agent’s transcript');
        if (rec.btn.title !== tip) rec.btn.title = tip;
        rec.btn.onclick = () => openAgentLog(ag.agentId, ag.label);
        sec.appendChild(rec.row);
      });
      nextBody.appendChild(sec);
    }
    for (const k of [...rows.keys()]) if (!seen.has(k)) rows.delete(k);

    // ── Result / error ──
    if (wf.error) {
      const box = document.createElement('details');
      box.className = 'workflow-detail-box workflow-detail-error';
      box.dataset.box = 'error';
      box.innerHTML = `<summary>${escHtml(t('Error'))}</summary><pre>${escHtml(wf.error)}</pre>`;
      if (openBoxes.has('error')) box.open = true;
      nextBody.appendChild(box);
    } else if (wf.result) {
      const box = document.createElement('details');
      box.className = 'workflow-detail-box';
      box.dataset.box = 'result';
      box.innerHTML = `<summary>${escHtml(t('Result'))}</summary><pre>${escHtml(wf.result)}</pre>`;
      if (openBoxes.has('result')) box.open = true;
      nextBody.appendChild(box);
    }
    body.replaceChildren(nextBody);
  };

  // While the run is in progress the endpoint returns a live skeleton (status
  // 'running'); poll until a terminal snapshot replaces it, then stop.
  let pollTimer = null;
  let pollSlow = false; // 15s re-check of a killed/failed run (resume watch)
  const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
  const load = async () => {
    const q = new URLSearchParams({ runId });
    if (claudeSessionId) q.set('claudeSessionId', claudeSessionId);
    if (cwd) q.set('cwd', cwd);
    if (host) q.set('host', host);
    try {
      const res = await fetch(`/api/workflow?${q}`);
      if (!res.ok) {
        stopPoll();
        const body = await res.json().catch(() => ({}));
        root.innerHTML = `<div class="empty-hint">${escHtml(body.error || t('Workflow not found.'))}<br><span class="workflow-hint-sub">${escHtml(t("Live tracking needs the run's working directory — open this from the workflow's own chat session."))}</span></div>`;
        return;
      }
      const wf = await res.json();
      render(wf);
      if (wf.status === 'running') {
        // hidden-tab backoff: 2.5s polling of a background tab is waste
        if (!pollTimer || pollSlow) { stopPoll(); pollSlow = false; pollTimer = setInterval(() => { if (!document.hidden) load(); }, 2500); }
      } else if (wf.status === 'killed' || wf.status === 'failed' || wf.status === 'stalled') {
        // a killed/failed/stalled run can be RESUMED under the SAME runId
        // (verified: resumeFromRunId reuses it) — keep a slow re-check so an
        // open viewer notices the resume / the healed final snapshot instead of
        // freezing on the stale state forever (real report)
        if (!pollTimer || !pollSlow) { stopPoll(); pollSlow = true; pollTimer = setInterval(() => { if (!document.hidden) load(); }, 15000); }
      } else {
        stopPoll(); // completed — genuinely final
      }
    } catch (e) {
      // transient (server restart mid-run) — keep polling if we already are
      if (!pollTimer) root.innerHTML = `<div class="empty-hint">${escHtml(t('Failed to load workflow:'))} ${escHtml(e.message)}</div>`;
    }
  };
  load();

  winInfo.onClose = () => { stopPoll(); app._checkWelcome(); };
  return winInfo;
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ──
registerWindowType({
  type: 'workflow', label: 'Workflow',
  icon: svgIcon16('<circle cx="3" cy="8" r="2"/><circle cx="13" cy="3.5" r="1.8"/><circle cx="13" cy="8" r="1.8"/><circle cx="13" cy="12.5" r="1.8"/><path d="M5 8h2M11.2 3.5H8a1 1 0 00-1 1v6a1 1 0 001 1h3.2M7 8h4"/>'),
  action: 'openWorkflowDetail', replay: (app, spec, { syncId } = {}) => app.openWorkflowDetail(spec.runId, { syncId, claudeSessionId: spec.claudeSessionId, cwd: spec.cwd, name: spec.name, host: spec.host }),
});
