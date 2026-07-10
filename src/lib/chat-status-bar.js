import { escHtml, showInputDialog } from './utils.js';
import { UI_ICONS } from './icons.js';
import { t } from './i18n.js';

/**
 * ChatStatusBar — status bar for chat mode sessions.
 * Shows model, permission mode, background tasks, context usage, cache ratio, cost.
 */
export class ChatStatusBar {
  /**
   * @param {object} ws - WsManager instance
   * @param {string} sessionId - session identifier
   * @param {object} opts
   * @param {string} [opts.backend] - backend identifier
   * @param {function} opts.getToolMsg - (toolCallId) => msg, looks up tool message for popup details
   * @param {function} opts.openSubagentViewer - ({ parentToolUseId, description }) => void
   * @param {function} opts.openInTempEditor - (text) => void
   * @param {function} [opts.startReview] - ({ target, delivery }) => void
   */
  constructor(ws, sessionId, { backend = 'claude', allowReview = false, getToolMsg, openSubagentViewer, openInTempEditor, startReview, onConfigChange, onOpenWorkflow, getWorkflowIds }) {
    this._ws = ws;
    this._sessionId = sessionId;
    this._backend = backend;
    this._onConfigChange = onConfigChange || null;
    this._servedModel = null; // actual serving model (per-turn) — fallback detection
    this._allowReview = allowReview;
    this._reviewEnabled = !allowReview;
    this._getToolMsg = getToolMsg;
    this._openSubagentViewer = openSubagentViewer;
    this._openInTempEditor = openInTempEditor;
    this._startReview = startReview || (() => {});
    this._onOpenWorkflow = onOpenWorkflow || null;
    this._getWorkflowIds = getWorkflowIds || (() => ({}));

    // Status state
    this._statusModel = '';
    this._statusLastInputTokens = 0;
    this._statusLastCacheRead = 0;
    this._statusCost = 0;
    this._statusContextWindow = 0;
    this._statusPermMode = '';
    this._permissionModes = null;
    this._activeTasks = null;
    this._goal = null;
    this._goalElapsed = 0;
    this._goalStatus = null;

    // Container reference (set via popupContainer setter for dropdown positioning)
    this._popupContainer = null;

    // Build DOM
    this._element = document.createElement('div');
    this._element.className = 'chat-status-bar';

    // Click handlers
    this._element.addEventListener('click', (e) => {
      this._onClick(e);
    });
  }

  /** The .chat-status-bar element */
  dispose() {
    this._disposed = true;
    if (this._wfTimer) { clearTimeout(this._wfTimer); this._wfTimer = null; }
  }

  get element() { return this._element; }

  /** Current model name */
  get statusModel() { return this._statusModel; }

  /** Current permission mode */
  get statusPermMode() { return this._statusPermMode; }

  /** Available permission modes */
  get permissionModes() { return this._permissionModes; }

  /** Active background tasks Map */
  get activeTasks() { return this._activeTasks; }

  /** Set the container for popup positioning (the .chat-view element) */
  set popupContainer(el) { this._popupContainer = el; }

  // ── Public API ──

  applyStatus(status) {
    if (!status) return;
    if (status.model) this._statusModel = status.model; // as reported — no stripping, no guessing
    if (status.contextWindow) this._statusContextWindow = status.contextWindow;
    if (status.lastUsage) {
      const u = status.lastUsage;
      this._statusLastInputTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      this._statusLastCacheRead = u.cache_read_input_tokens || 0;
    }
    if (status.total_cost_usd) this._statusCost = status.total_cost_usd;
    if (status.permissionMode) this._statusPermMode = status.permissionMode;
    if (status.permissionModes) this._permissionModes = status.permissionModes;
    if (status.effort) this._statusEffort = status.effort;
    if (status.sandbox) this._statusSandbox = status.sandbox;
    if (status.totalUsage) this._statusTotalUsage = status.totalUsage;
    this.render();
  }

  updateUsage(usageData) {
    const u = usageData;
    this._statusLastInputTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    this._statusLastCacheRead = u.cache_read_input_tokens || 0;
    if (u.totals) this._statusTotalUsage = u.totals; // Codex: cumulative session usage
    this.render();
  }

  updateTask(taskInfo, toolCallId, content) {
    if (!this._activeTasks) this._activeTasks = new Map();
    if (taskInfo.status !== 'running') {
      this._activeTasks.delete(toolCallId);
    } else {
      const block = content?.[0];
      const task = { ...taskInfo };
      if (block?.type === 'tool_call') {
        task.toolName = block.toolName;
        task.command = block.input?.command || '';
      }
      this._activeTasks.set(toolCallId, task);
    }
    this.render();
  }

  // ── Running dynamic-workflow chips (2.81.0, user request: 状态栏可快速查看
  // 正在执行的工作流). Tracked from Workflow tool results ("Run ID: wf_…");
  // a light poll against /api/workflow keeps agent counts fresh and drops the
  // chip the moment the run leaves 'running'. Click → the workflow detail
  // window (live view). Poll only runs while chips exist.
  trackWorkflow(runId, name) {
    if (!runId) return;
    if (!this._workflows) this._workflows = new Map();
    if (this._workflows.has(runId)) return;
    this._workflows.set(runId, { runId, name: name || runId, agents: 0, done: 0, probed: false });
    this.render();
    this._pollWorkflows();
  }

  _pollWorkflows() {
    if (this._wfTimer || !this._workflows?.size) return;
    const tick = async () => {
      this._wfTimer = null;
      if (this._disposed || !this._workflows?.size) return;
      const ids = this._getWorkflowIds() || {};
      for (const [runId, wf] of [...this._workflows]) {
        try {
          const r = await fetch(`/api/workflow?runId=${encodeURIComponent(runId)}&claudeSessionId=${encodeURIComponent(ids.claudeId || '')}&cwd=${encodeURIComponent(ids.cwd || '')}`);
          if (r.status === 404) { this._workflows.delete(runId); continue; }
          const d = await r.json().catch(() => null);
          if (!d || (d.status && d.status !== 'running')) { this._workflows.delete(runId); continue; }
          wf.agents = d.agentCount || 0;
          wf.done = d.doneCount || 0;
          if (d.workflowName) wf.name = d.workflowName;
          wf.probed = true;
        } catch { /* transient — keep the chip */ }
      }
      this.render();
      if (this._workflows.size) this._wfTimer = setTimeout(tick, 8000);
    };
    this._wfTimer = setTimeout(tick, 1200);
  }

  setTasks(tasks) {
    const next = new Map();
    for (const [toolCallId, taskInfo] of Object.entries(tasks || {})) {
      if (taskInfo?.status === 'running') next.set(toolCallId, { ...taskInfo });
    }
    this._activeTasks = next.size ? next : null;
    this.render();
  }

  addCost(cost, modelUsage) {
    if (cost) { this._statusCost += cost; }
    if (modelUsage) {
      const info = Object.values(modelUsage)[0];
      if (info?.contextWindow) this._statusContextWindow = info.contextWindow;
      if (!this._statusModel) this._statusModel = Object.keys(modelUsage)[0] || '';
    }
    this.render();
  }

  setModel(model) {
    this._statusModel = model;
    this.render();
  }

  // Actual serving model from the latest assistant turn — when it diverges
  // from the commanded/reported one, the harness auto-fell-back (e.g. fable
  // overloaded → opus). Alias-tolerant compare ('fable' vs 'claude-fable-5').
  setServedModel(model) {
    if (this._servedModel === model) return;
    this._servedModel = model;
    this.render();
  }

  _modelMismatch() {
    if (!this._servedModel || !this._statusModel) return false;
    const core = (v) => String(v || '').replace(/\[1m\]$/, '').trim().replace(/^claude-/, '');
    const a = core(this._servedModel), b = core(this._statusModel);
    return !(a === b || a.startsWith(b) || b.startsWith(a));
  }

  setPermMode(mode) {
    this._statusPermMode = mode;
    this.render();
  }

  setGoal(goal, elapsedMs) {
    if (goal) {
      this._goal = goal;
      if (elapsedMs) this._goalElapsed = elapsedMs;
    } else {
      this._goal = null;
      this._goalElapsed = 0;
      this._goalStatus = null;
    }
    this.render();
  }

  setGoalStatus(status) {
    this._goalStatus = status;
    this.render();
  }

  setReviewEnabled(enabled) {
    this._reviewEnabled = !!enabled;
    this.render();
  }

  render() {
    const fmtK = (n) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'm' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
    // Semantic tier colors — theme vars (CSS vars work in inline styles), never
    // hardcoded hexes; "orange" is the midpoint between the red and yellow tiers.
    const tierRed = 'var(--red, #e55)';
    const tierYellow = 'var(--yellow, #e5c07b)';
    const tierOrange = `color-mix(in srgb, ${tierRed} 50%, ${tierYellow})`;
    const tierGreen = 'var(--green, #3fb950)';
    const parts = [];

    // Model + effort badges — separate clickable segments, both ALWAYS
    // rendered: when a value hasn't been reported/commanded we say so
    // explicitly ("?") instead of hiding or guessing.
    {
      const known = !!this._statusModel;
      const mismatch = this._modelMismatch();
      const title = mismatch
        ? t('Auto-fallback: the harness is serving {served} instead of {model} (capacity/overload). Click to re-pick.', { served: this._servedModel, model: this._statusModel })
        : known
          ? t('Model (as last reported by the CLI) — click to change')
          : t('Model not reported by the CLI yet — click to set');
      const label = mismatch ? `\u26a0 ${escHtml(this._servedModel)}` : (known ? escHtml(this._statusModel) : t('model: ?'));
      parts.push(`<span class="chat-status-model chat-status-clickable${known ? '' : ' chat-status-dim'}${mismatch ? ' chat-status-model-fallback' : ''}" title="${escHtml(title)}">${label}</span>`);
      const eKnown = !!this._statusEffort;
      const eTitle = eKnown
        ? (this._backend === 'codex'
          ? t('Reasoning effort (as reported per turn) — click to change (applies from the next turn)')
          : t('Reasoning effort (as last commanded — the CLI does not report it back) — click to change'))
        : t('Reasoning effort not set/reported — click to change');
      parts.push(`<span class="chat-status-effort chat-status-clickable${eKnown ? '' : ' chat-status-dim'}" title="${escHtml(eTitle)}">${eKnown ? escHtml(this._statusEffort) : t('effort: ?')}</span>`);
    }

    // Goal indicator — always rendered so there's a discoverable entry point
    // for SETTING a goal, not just viewing one (dim \u{1F3AF} when no goal active)
    if (this._goal) {
      const elapsed = this._fmtElapsed(this._goalElapsed || 0);
      // Codex sends lowercase active/paused/blocked/complete — normalize case
      const status = (this._goalStatus || '').toLowerCase();
      // Codex statuses beyond the basic four: usageLimited (rate limit hit —
      // resumes only via explicit reactivation), budgetLimited (token budget)
      const statusIcon = status === 'active' ? UI_ICONS.play : status === 'paused' ? UI_ICONS.pause : status === 'blocked' ? UI_ICONS.block : status === 'complete' ? UI_ICONS.check
        : status === 'usagelimited' ? UI_ICONS.hourglass : status === 'budgetlimited' ? UI_ICONS.coin : '';
      const statusHint = status === 'usagelimited' ? t(' — paused by usage limit, click → Continue Goal to resume')
        : status === 'budgetlimited' ? t(' — token budget exhausted, click → Continue Goal to resume') : '';
      const shortGoal = this._goal.length > 30 ? this._goal.substring(0, 30) + '…' : this._goal;
      parts.push(`<span class="chat-status-goal chat-status-clickable" title="${escHtml(this._goal + statusHint)}">${UI_ICONS.goal}${statusIcon ? ' ' + statusIcon : ''} <span class="chat-goal-timer">${elapsed}</span> ${escHtml(shortGoal)}</span>`);
    } else {
      parts.push(`<span class="chat-status-goal chat-status-goal-empty chat-status-clickable" title="${escHtml(t('Set a goal \u2014 the agent keeps working until the condition is met'))}">${UI_ICONS.goal}</span>`);
    }

    // Permission mode (always show, click to change; Codex sandbox policy in tooltip)
    const permLabel = this._statusPermMode || 'default';
    const permTitle = this._statusSandbox ? t('Click to change permission mode \u00B7 sandbox: {sandbox}', { sandbox: this._statusSandbox }) : t('Click to change permission mode');
    parts.push(`<span class="chat-status-perm chat-status-clickable" title="${escHtml(permTitle)}">${UI_ICONS.lock} ${escHtml(permLabel)}</span>`);

    // Background tasks
    if (this._activeTasks?.size > 0) {
      const count = this._activeTasks.size;
      const tasks = [...this._activeTasks.values()];
      const label = count === 1 ? tasks[0].description : t('{count} tasks', { count });
      parts.push(`<span class="chat-status-tasks chat-status-clickable" title="${escHtml(tasks.map(t => t.description).join(', '))}">${UI_ICONS.refresh} ${escHtml(label)}</span>`);
    }

    // Running dynamic workflows — one chip each (rare to have >2)
    if (this._workflows?.size) {
      for (const wf of this._workflows.values()) {
        const prog = wf.probed && wf.agents ? ` ${wf.done}/${wf.agents}` : '';
        parts.push(`<span class="chat-status-wf chat-status-clickable" data-wf-run="${escHtml(wf.runId)}" data-wf-name="${escHtml(wf.name)}" title="${escHtml(t('Workflow running — click for the live view'))}">⛭ ${escHtml(String(wf.name).slice(0, 24))}${prog}</span>`);
      }
    }

    if (this._backend === 'codex' && this._allowReview) {
      const reviewClass = this._reviewEnabled ? 'chat-status-clickable' : 'chat-status-dim';
      const reviewTitle = this._reviewEnabled
        ? t('Start Codex review')
        : t('Review becomes available after the first completed assistant turn');
      parts.push(`<span class="chat-status-review ${reviewClass}" title="${escHtml(reviewTitle)}">\u2713 ${escHtml(t('Review'))}</span>`);
    }

    // Context: used tokens without a fake percentage when the window is unknown
    if (!this._statusContextWindow && this._statusLastInputTokens) {
      const usedK = fmtK(this._statusLastInputTokens);
      parts.push(`<span class="chat-status-ctx chat-status-dim" title="${escHtml(t('Context used last turn: {used} tokens. The context window size was not reported by the CLI, so no percentage is shown.', { used: usedK }))}">${escHtml(usedK)}/?</span>`);
    }
    // Context % with pie chart
    if (this._statusContextWindow && this._statusLastInputTokens) {
      const pct = Math.min(100, Math.round((this._statusLastInputTokens / this._statusContextWindow) * 100));
      const color = pct > 95 ? tierRed : pct > 85 ? tierOrange : pct > 70 ? tierYellow : tierGreen;
      const deg = Math.round(pct * 3.6);
      const usedK = fmtK(this._statusLastInputTokens);
      const totalK = fmtK(this._statusContextWindow);
      let ctxTitle = t('Context: {used} of {total} tokens', { used: usedK, total: totalK });
      if (this._statusTotalUsage) {
        const u = this._statusTotalUsage;
        ctxTitle += ' \u00B7 ' + t('session total: {total} (in {inp}, cached {cached}, out {out}{reasoning})', {
          total: fmtK(u.total_tokens || 0), inp: fmtK(u.input_tokens || 0), cached: fmtK(u.cached_input_tokens || 0),
          out: fmtK(u.output_tokens || 0), reasoning: u.reasoning_output_tokens ? t(', reasoning {n}', { n: fmtK(u.reasoning_output_tokens) }) : '',
        });
      }
      parts.push(`<span class="chat-status-ctx" title="${escHtml(ctxTitle)}"><span class="chat-status-ctx-pie" style="background:conic-gradient(${color} ${deg}deg, var(--bg-input) ${deg}deg)"></span> <span style="color:${color}">${pct}%</span><span class="chat-status-dim">[${usedK}/${totalK}]</span></span>`);
    }

    // Cache ratio
    if (this._statusLastCacheRead != null && this._statusLastInputTokens) {
      const cacheTotal = this._statusLastInputTokens;
      const cachePct = cacheTotal > 0 ? Math.round((this._statusLastCacheRead / cacheTotal) * 100) : 0;
      const cacheColor = cachePct >= 80 ? tierGreen : cachePct >= 50 ? tierYellow : tierOrange;
      const cacheTip = t('Prompt cache hit rate (last turn): {pct}% of input tokens were read from cache ({read} of {total}). Higher = cheaper + faster.', { pct: cachePct, read: fmtK(this._statusLastCacheRead), total: fmtK(cacheTotal) });
      parts.push(`<span style="color:${cacheColor}" title="${escHtml(cacheTip)}">${UI_ICONS.bolt}${cachePct}%</span><span class="chat-status-dim" title="${escHtml(cacheTip)}">[${fmtK(this._statusLastCacheRead)}]</span>`);
    }

    // Cost with color tiers
    if (this._statusCost > 0) {
      const costColor = this._statusCost > 5 ? tierRed : this._statusCost > 1 ? tierOrange : tierGreen;
      parts.push(`<span style="color:${costColor}">$${this._statusCost.toFixed(2)}</span>`);
    }

    this._element.innerHTML = parts.join(' ');
  }

  // ── Private ──

  _fmtElapsed(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
    const h = Math.floor(m / 60);
    return `${h}h${String(m % 60).padStart(2, '0')}m`;
  }

  _onClick(e) {
    const wfChip = e.target.closest('.chat-status-wf');
    if (wfChip && this._onOpenWorkflow) {
      this._onOpenWorkflow(wfChip.dataset.wfRun, wfChip.dataset.wfName);
      return;
    }
    const container = this._popupContainer || this._element.parentElement;
    const showDropdown = (anchor) => {
      const existing = container.querySelector('.chat-status-dropdown');
      if (existing) { existing.remove(); return null; }
      // The bottom/left math is relative to the container — which is only what
      // position:absolute resolves against if the container is itself
      // positioned. A static container silently re-anchors the dropdown to
      // some ancestor and it lands off-screen (invisible "dead" click).
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      const dropdown = document.createElement('div');
      dropdown.className = 'chat-status-dropdown';
      dropdown.dataset.popover = '1'; // app-wide Escape-dismiss protocol (app.js removes [data-popover])
      const rect = anchor.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      dropdown.style.position = 'absolute';
      dropdown.style.bottom = (containerRect.bottom - rect.top + 4) + 'px';
      dropdown.style.left = (rect.left - containerRect.left) + 'px';
      container.appendChild(dropdown);
      const close = (ev) => {
        if (!dropdown.contains(ev.target) && ev.target !== anchor) {
          dropdown.remove();
          document.removeEventListener('mousedown', close);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', close), 0);
      return dropdown;
    };

    // Background tasks click -> popup
    const taskEl = e.target.closest('.chat-status-tasks');
    if (taskEl && this._activeTasks?.size) {
      e.stopPropagation();
      const dropdown = showDropdown(taskEl);
      if (!dropdown) return;
      for (const [toolUseId, task] of this._activeTasks) {
        const item = document.createElement('div');
        item.className = 'chat-status-dropdown-item chat-task-detail';
        const icon = task.type === 'agent' ? UI_ICONS.robot : UI_ICONS.tasks;
        let detail = `<div class="chat-task-title">${icon} ${escHtml(task.description)}</div>`;
        if (task.lastTool) detail += `<div class="chat-status-dim">${escHtml(t('Running: {tool}', { tool: task.lastTool }))}</div>`;
        item.innerHTML = detail;
        item.onclick = (ev) => {
          ev.stopPropagation(); dropdown.remove();
          if (task.type === 'agent') {
            this._openSubagentViewer({
              parentToolUseId: toolUseId,
              threadId: task.receiverThreadIds?.[0] || '',
              description: task.description,
              agentRole: task.agentRole || '',
              agentNickname: task.agentNickname || '',
            });
          } else {
            // Open command input + output in editor
            const toolMsg = this._getToolMsg(toolUseId);
            const block = toolMsg?.content?.[0];
            const input = block?.input || {};
            const toolName = task.toolName || block?.toolName || 'Bash';
            const command = task.command || input.command || JSON.stringify(input, null, 2);
            const output = task.resultText || block?.output || '';
            let text = `[${toolName}] ${task.description}\n\n--- ${t('Command')} ---\n${command}\n`;
            if (output) text += `\n--- ${t('Output')} ---\n${output}\n`;
            this._openInTempEditor(text);
          }
        };
        dropdown.appendChild(item);
      }
      return;
    }

    // Goal click -> popup with full text + controls
    const goalEl = e.target.closest('.chat-status-goal');
    if (goalEl && this._goal) {
      e.stopPropagation();
      const dropdown = showDropdown(goalEl);
      if (!dropdown) return;
      dropdown.style.minWidth = '240px';
      dropdown.style.maxWidth = '400px';
      const content = document.createElement('div');
      content.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px';
      const text = document.createElement('div');
      text.style.cssText = 'font-size:12px;white-space:pre-wrap;word-break:break-word;color:var(--text)';
      text.textContent = this._goal;
      const elapsed = document.createElement('div');
      elapsed.style.cssText = 'font-size:11px;color:var(--text-dim)';
      const statusLabel = this._goalStatus ? ` · ${this._goalStatus}` : '';
      elapsed.textContent = t('Pursued for {time}', { time: this._fmtElapsed(this._goalElapsed || 0) }) + statusLabel;
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px';
      const isActive = (this._goalStatus || '').toLowerCase() === 'active';
      if (!isActive) {
        const continueBtn = document.createElement('button');
        continueBtn.className = 'chat-perm-btn chat-perm-allow';
        continueBtn.textContent = t('Continue Goal');
        continueBtn.onclick = () => {
          dropdown.remove();
          this._ws.send({ type: 'set-goal', sessionId: this._sessionId, goal: this._goal });
        };
        actions.append(continueBtn);
      }
      const clearBtn = document.createElement('button');
      clearBtn.className = 'chat-perm-btn chat-perm-deny';
      clearBtn.textContent = t('Clear');
      clearBtn.onclick = () => { dropdown.remove(); this._ws.send({ type: 'set-goal', sessionId: this._sessionId, goal: null }); };
      actions.append(clearBtn);
      content.append(text, elapsed, actions);
      dropdown.appendChild(content);
      return;
    }

    // No active goal → set-a-goal popup (the only entry point besides typing /goal)
    if (goalEl && !this._goal) {
      e.stopPropagation();
      const dropdown = showDropdown(goalEl);
      if (!dropdown) return;
      dropdown.style.minWidth = '280px';
      dropdown.style.maxWidth = '420px';
      const content = document.createElement('div');
      content.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px';
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px;color:var(--text-dim)';
      hint.textContent = t('The agent keeps working until this condition is met:');
      const input = document.createElement('textarea');
      input.className = 'filter-input chat-ask-custom'; // filter-input themes it like .chat-input (bg-input/border/radius/focus-accent)
      input.rows = 2;
      input.placeholder = t('e.g. all tests in tests/ pass');
      input.style.cssText = 'resize:vertical;font-size:12px;width:100%;margin:0';
      const submit = () => {
        const goal = input.value.trim();
        if (!goal) return;
        dropdown.remove();
        this._ws.send({ type: 'set-goal', sessionId: this._sessionId, goal });
      };
      input.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); submit(); } ev.stopPropagation(); };
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px;align-items:center';
      const setBtn = document.createElement('button');
      setBtn.className = 'chat-perm-btn chat-perm-allow';
      setBtn.textContent = t('Set Goal');
      setBtn.onclick = submit;
      actions.append(setBtn);
      const resumeLink = document.createElement('button');
      resumeLink.className = 'chat-perm-btn';
      resumeLink.textContent = t('Resume previous');
      resumeLink.title = t('Re-activate the last cleared/completed goal');
      resumeLink.onclick = () => { dropdown.remove(); this._ws.send({ type: 'set-goal', sessionId: this._sessionId, action: 'resume' }); };
      actions.append(resumeLink);
      content.append(hint, input, actions);
      dropdown.appendChild(content);
      setTimeout(() => input.focus(), 0);
      return;
    }

    const reviewEl = e.target.closest('.chat-status-review');
    if (reviewEl && this._backend === 'codex' && this._allowReview && this._reviewEnabled) {
      e.stopPropagation();
      const dropdown = showDropdown(reviewEl);
      if (!dropdown) return;
      const reviewOptions = [
        { label: t('Working tree'), target: { type: 'uncommittedChanges' }, delivery: 'inline' },
        { label: t('Working tree (detached)'), target: { type: 'uncommittedChanges' }, delivery: 'detached' },
        { label: t('Base branch…'), kind: 'baseBranch', delivery: 'inline' },
        { label: t('Base branch… (detached)'), kind: 'baseBranch', delivery: 'detached' },
        { label: t('Commit…'), kind: 'commit', delivery: 'inline' },
        { label: t('Commit… (detached)'), kind: 'commit', delivery: 'detached' },
        { label: t('Custom…'), kind: 'custom', delivery: 'inline' },
        { label: t('Custom… (detached)'), kind: 'custom', delivery: 'detached' },
      ];
      for (const option of reviewOptions) {
        const item = document.createElement('div');
        item.className = 'chat-status-dropdown-item';
        item.textContent = option.label;
        item.onclick = async (ev) => {
          ev.stopPropagation();
          dropdown.remove();
          let target = option.target || null;
          if (option.kind === 'baseBranch') {
            const branch = await showInputDialog({ title: t('Review vs Branch'), label: t('Base branch to review against'), value: 'main', confirmText: t('Review') });
            if (!branch) return;
            target = { type: 'baseBranch', branch: branch.trim() };
          } else if (option.kind === 'commit') {
            const sha = await showInputDialog({ title: t('Review Commit'), label: t('Commit SHA to review'), confirmText: t('Review') });
            if (!sha) return;
            target = { type: 'commit', sha: sha.trim() };
          } else if (option.kind === 'custom') {
            const instructions = await showInputDialog({ title: t('Custom review'), label: t('Review instructions'), confirmText: t('Review'), multiline: true });
            if (!instructions) return;
            target = { type: 'custom', instructions: instructions.trim() };
          }
          if (!target) return;
          this._startReview({ target, delivery: option.delivery || 'inline' });
        };
        dropdown.appendChild(item);
      }
      return;
    }

    // Effort click -> dropdown (mid-session reasoning-effort switch)
    const effortEl = e.target.closest('.chat-status-effort');
    if (effortEl) {
      e.stopPropagation();
      const dropdown = showDropdown(effortEl);
      if (!dropdown) return;
      const pickE = (effort, label) => {
        this._ws.send({ type: 'set-effort', sessionId: this._sessionId, effort });
        // Mid-session picks persist as this session's per-session config, so
        // the NEXT resume starts with the same effort (user-requested).
        this._onConfigChange?.({ effort: effort || null });
        // Optimistic — claude never reports effort back (apply_flag_settings is
        // success-blind); codex confirms via turn_context on the next turn.
        this._statusEffort = effort || '';
        this.render();
      };
      const addItems = (levels) => {
        for (const lv of levels) {
          const item = document.createElement('div');
          item.className = 'chat-status-dropdown-item' + ((lv.value || '') === (this._statusEffort || '') ? ' active' : '');
          item.textContent = lv.label;
          item.onclick = (ev) => { ev.stopPropagation(); dropdown.remove(); pickE(lv.value); };
          dropdown.appendChild(item);
        }
      };
      if (this._backend === 'codex') {
        // Effort levels are MODEL-SPECIFIC since GPT-5.6 (sol/terra go up to
        // ultra, luna to max, older models stop at xhigh) — prefer the current
        // model's reported levels from the models cache, fall back to the union
        // of all models, then to the classic ladder if the fetch fails.
        const codexLadder = (levels) => [{ value: '', label: t('Auto (model default)') },
          ...levels.map(v => ({ value: v, label: v }))];
        const loading = document.createElement('div');
        loading.className = 'chat-status-dropdown-item chat-status-dim';
        loading.textContent = t('Loading…');
        dropdown.appendChild(loading);
        fetch('/api/available-models').then(r => r.json()).then(data => {
          if (!dropdown.isConnected) return;
          loading.remove();
          const models = (data?.codex || []).filter(m => m.id);
          const rank = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
          const cur = models.find(m => m.id === this._statusModel);
          let levels = (cur?.efforts?.length ? cur.efforts : [...new Set(models.flatMap(m => m.efforts || []))])
            .sort((a, b) => (rank.indexOf(a) + 1 || 99) - (rank.indexOf(b) + 1 || 99));
          if (!levels.length) levels = ['minimal', 'low', 'medium', 'high', 'xhigh'];
          addItems(codexLadder(levels));
        }).catch(() => {
          if (!dropdown.isConnected) return;
          loading.remove();
          addItems(codexLadder(['minimal', 'low', 'medium', 'high', 'xhigh']));
        });
      } else {
        // Async population: show a Loading row immediately (a bare empty box
        // reads as a dead click), and NEVER vanish on fetch failure — the
        // effort enum is stable, so fall back to the hardcoded ladder.
        const claudeLadder = (levels) => [{ value: '', label: t('Default (reset)') }, ...levels, { value: 'ultracode', label: t('ultracode (xhigh + workflows)') }];
        const loading = document.createElement('div');
        loading.className = 'chat-status-dropdown-item chat-status-dim';
        loading.textContent = t('Loading…');
        dropdown.appendChild(loading);
        fetch('/api/session-options').then(r => r.json()).then(data => {
          if (!dropdown.isConnected) return;
          loading.remove();
          const levels = (data?.effortLevels || ['low', 'medium', 'high', 'xhigh', 'max']).map(v => ({ value: v, label: v }));
          // "ultracode" isn't an effortLevel — it's a separate mode (xhigh +
          // dynamic-workflow orchestration). The CLI's own /effort UI appends it
          // to the ladder; mirror that. The adapter wires it via the ultracode
          // settings key, not effortLevel. (Gated CLI-side on an xhigh-capable
          // model + dynamic workflows — a no-op if unsupported.)
          addItems(claudeLadder(levels));
        }).catch(() => {
          if (!dropdown.isConnected) return;
          loading.remove();
          addItems(claudeLadder(['low', 'medium', 'high', 'xhigh', 'max'].map(v => ({ value: v, label: v }))));
        });
      }
      return;
    }

    // Model click -> dropdown (mid-session model switch)
    const modelEl = e.target.closest('.chat-status-model');
    if (modelEl) {
      e.stopPropagation();
      const dropdown = showDropdown(modelEl);
      if (!dropdown) return;
      const backend = this._backend === 'codex' ? 'codex' : 'claude';
      const pick = (model) => {
        this._ws.send({ type: 'set-model', sessionId: this._sessionId, model });
        this._onConfigChange?.({ model });
        // optimistic; the CLI's own confirmation (set_model echo / codex
        // turn_context) overwrites this with the RESOLVED id
        this._statusModel = model;
        this.render();
      };
      const addModelItems = (models) => {
        for (const m of models) {
          const item = document.createElement('div');
          item.className = 'chat-status-dropdown-item' + (m.id === this._statusModel ? ' active' : '');
          item.textContent = m.label || m.id;
          item.onclick = (ev) => { ev.stopPropagation(); dropdown.remove(); pick(m.id); };
          dropdown.appendChild(item);
        }
        const custom = document.createElement('div');
        custom.className = 'chat-status-dropdown-item';
        custom.textContent = t('Custom\u2026');
        custom.onclick = async (ev) => {
          ev.stopPropagation(); dropdown.remove();
          const v = await showInputDialog({ title: t('Set model'), label: t('Model ID or alias'), confirmText: t('Set') });
          if (v && v.trim()) pick(v.trim());
        };
        dropdown.appendChild(custom);
      };
      // Loading row while the model list fetches; on failure fall back to the
      // CLI alias ladder (+ Custom\u2026) instead of silently vanishing.
      const loading = document.createElement('div');
      loading.className = 'chat-status-dropdown-item chat-status-dim';
      loading.textContent = t('Loading\u2026');
      dropdown.appendChild(loading);
      fetch('/api/available-models').then(r => r.json()).then(data => {
        if (!dropdown.isConnected) return;
        loading.remove();
        addModelItems((data?.[backend] || []).filter(m => m.id));
      }).catch(() => {
        if (!dropdown.isConnected) return;
        loading.remove();
        addModelItems(backend === 'claude' ? ['fable', 'opus', 'sonnet', 'haiku'].map(id => ({ id })) : []);
      });
      return;
    }

    // Permission mode click -> dropdown
    const el = e.target.closest('.chat-status-perm');
    if (!el) return;
    e.stopPropagation();
    const modes = this._permissionModes || ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'auto'];
    const dropdown = showDropdown(el);
    if (!dropdown) return;
    for (const mode of modes) {
      const item = document.createElement('div');
      item.className = 'chat-status-dropdown-item' + (mode === this._statusPermMode ? ' active' : '');
      item.textContent = mode;
      item.onclick = (ev) => {
        ev.stopPropagation();
        dropdown.remove();
        this._ws.send({ type: 'set-permission-mode', sessionId: this._sessionId, mode });
        this._statusPermMode = mode;
        this.render();
      };
      dropdown.appendChild(item);
    }
  }
}
