import { escHtml, showInputDialog } from './utils.js';
import { UI_ICONS } from './icons.js';

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
  constructor(ws, sessionId, { backend = 'claude', allowReview = false, getToolMsg, openSubagentViewer, openInTempEditor, startReview }) {
    this._ws = ws;
    this._sessionId = sessionId;
    this._backend = backend;
    this._allowReview = allowReview;
    this._reviewEnabled = !allowReview;
    this._getToolMsg = getToolMsg;
    this._openSubagentViewer = openSubagentViewer;
    this._openInTempEditor = openInTempEditor;
    this._startReview = startReview || (() => {});

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
    if (status.model) this._statusModel = status.model.replace(/\[.*$/, '');
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
      if (!this._statusModel) this._statusModel = Object.keys(modelUsage)[0]?.replace(/\[.*$/, '');
    }
    this.render();
  }

  setModel(model) {
    this._statusModel = model;
    this.render();
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
    const parts = [];

    // Model badge (+ reasoning effort when known — Codex turn_context carries it)
    if (this._statusModel) {
      const effortSuffix = this._statusEffort ? ` \u00B7 ${escHtml(this._statusEffort)}` : '';
      parts.push(`<span class="chat-status-model" title="Model${this._statusEffort ? ' \u00B7 reasoning effort' : ''} (set at session creation)">${escHtml(this._statusModel)}${effortSuffix}</span>`);
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
      const statusHint = status === 'usagelimited' ? ' — paused by usage limit, click → Continue Goal to resume'
        : status === 'budgetlimited' ? ' — token budget exhausted, click → Continue Goal to resume' : '';
      const shortGoal = this._goal.length > 30 ? this._goal.substring(0, 30) + '…' : this._goal;
      parts.push(`<span class="chat-status-goal chat-status-clickable" title="${escHtml(this._goal + statusHint)}">${UI_ICONS.goal}${statusIcon ? ' ' + statusIcon : ''} <span class="chat-goal-timer">${elapsed}</span> ${escHtml(shortGoal)}</span>`);
    } else {
      parts.push(`<span class="chat-status-goal chat-status-goal-empty chat-status-clickable" title="Set a goal \u2014 the agent keeps working until the condition is met">${UI_ICONS.goal}</span>`);
    }

    // Permission mode (always show, click to change; Codex sandbox policy in tooltip)
    const permLabel = this._statusPermMode || 'default';
    const permTitle = this._statusSandbox ? `Click to change permission mode \u00B7 sandbox: ${this._statusSandbox}` : 'Click to change permission mode';
    parts.push(`<span class="chat-status-perm chat-status-clickable" title="${escHtml(permTitle)}">${UI_ICONS.lock} ${escHtml(permLabel)}</span>`);

    // Background tasks
    if (this._activeTasks?.size > 0) {
      const count = this._activeTasks.size;
      const tasks = [...this._activeTasks.values()];
      const label = count === 1 ? tasks[0].description : `${count} tasks`;
      parts.push(`<span class="chat-status-tasks chat-status-clickable" title="${escHtml(tasks.map(t => t.description).join(', '))}">${UI_ICONS.refresh} ${escHtml(label)}</span>`);
    }

    if (this._backend === 'codex' && this._allowReview) {
      const reviewClass = this._reviewEnabled ? 'chat-status-clickable' : 'chat-status-dim';
      const reviewTitle = this._reviewEnabled
        ? 'Start Codex review'
        : 'Review becomes available after the first completed assistant turn';
      parts.push(`<span class="chat-status-review ${reviewClass}" title="${escHtml(reviewTitle)}">\u2713 Review</span>`);
    }

    // Context % with pie chart
    if (this._statusContextWindow && this._statusLastInputTokens) {
      const pct = Math.min(100, Math.round((this._statusLastInputTokens / this._statusContextWindow) * 100));
      const color = pct > 95 ? '#ef4444' : pct > 85 ? '#f97316' : pct > 70 ? '#eab308' : '#22c55e';
      const deg = Math.round(pct * 3.6);
      const usedK = fmtK(this._statusLastInputTokens);
      const totalK = fmtK(this._statusContextWindow);
      let ctxTitle = `Context: ${usedK} of ${totalK} tokens`;
      if (this._statusTotalUsage) {
        const t = this._statusTotalUsage;
        ctxTitle += ` \u00B7 session total: ${fmtK(t.total_tokens || 0)} (in ${fmtK(t.input_tokens || 0)}, cached ${fmtK(t.cached_input_tokens || 0)}, out ${fmtK(t.output_tokens || 0)}${t.reasoning_output_tokens ? `, reasoning ${fmtK(t.reasoning_output_tokens)}` : ''})`;
      }
      parts.push(`<span class="chat-status-ctx" title="${escHtml(ctxTitle)}"><span class="chat-status-ctx-pie" style="background:conic-gradient(${color} ${deg}deg, var(--bg-input) ${deg}deg)"></span> <span style="color:${color}">${pct}%</span><span class="chat-status-dim">[${usedK}/${totalK}]</span></span>`);
    }

    // Cache ratio
    if (this._statusLastCacheRead != null && this._statusLastInputTokens) {
      const cacheTotal = this._statusLastInputTokens;
      const cachePct = cacheTotal > 0 ? Math.round((this._statusLastCacheRead / cacheTotal) * 100) : 0;
      const cacheColor = cachePct >= 80 ? '#22c55e' : cachePct >= 50 ? '#eab308' : '#f97316';
      parts.push(`<span style="color:${cacheColor}">${UI_ICONS.bolt}${cachePct}%</span><span class="chat-status-dim">[${fmtK(this._statusLastCacheRead)}]</span>`);
    }

    // Cost with color tiers
    if (this._statusCost > 0) {
      const costColor = this._statusCost > 5 ? '#ef4444' : this._statusCost > 1 ? '#f97316' : '#22c55e';
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
    const container = this._popupContainer || this._element.parentElement;
    const showDropdown = (anchor) => {
      const existing = container.querySelector('.chat-status-dropdown');
      if (existing) { existing.remove(); return null; }
      const dropdown = document.createElement('div');
      dropdown.className = 'chat-status-dropdown';
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
        if (task.lastTool) detail += `<div class="chat-status-dim">Running: ${escHtml(task.lastTool)}</div>`;
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
            let text = `[${toolName}] ${task.description}\n\n--- Command ---\n${command}\n`;
            if (output) text += `\n--- Output ---\n${output}\n`;
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
      elapsed.textContent = `Pursued for ${this._fmtElapsed(this._goalElapsed || 0)}${statusLabel}`;
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px';
      const isActive = (this._goalStatus || '').toLowerCase() === 'active';
      if (!isActive) {
        const continueBtn = document.createElement('button');
        continueBtn.className = 'chat-perm-btn chat-perm-allow';
        continueBtn.textContent = 'Continue Goal';
        continueBtn.onclick = () => {
          dropdown.remove();
          this._ws.send({ type: 'set-goal', sessionId: this._sessionId, goal: this._goal });
        };
        actions.append(continueBtn);
      }
      const clearBtn = document.createElement('button');
      clearBtn.className = 'chat-perm-btn chat-perm-deny';
      clearBtn.textContent = 'Clear';
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
      hint.textContent = 'The agent keeps working until this condition is met:';
      const input = document.createElement('textarea');
      input.className = 'chat-ask-custom';
      input.rows = 2;
      input.placeholder = 'e.g. all tests in tests/ pass';
      input.style.cssText = 'resize:vertical;font-size:12px;width:100%';
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
      setBtn.textContent = 'Set Goal';
      setBtn.onclick = submit;
      actions.append(setBtn);
      const resumeLink = document.createElement('button');
      resumeLink.className = 'chat-perm-btn';
      resumeLink.textContent = 'Resume previous';
      resumeLink.title = 'Re-activate the last cleared/completed goal';
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
        { label: 'Working Tree', target: { type: 'uncommittedChanges' }, delivery: 'inline' },
        { label: 'Working Tree (Detached)', target: { type: 'uncommittedChanges' }, delivery: 'detached' },
        { label: 'Base Branch...', kind: 'baseBranch', delivery: 'inline' },
        { label: 'Base Branch... (Detached)', kind: 'baseBranch', delivery: 'detached' },
        { label: 'Commit...', kind: 'commit', delivery: 'inline' },
        { label: 'Commit... (Detached)', kind: 'commit', delivery: 'detached' },
        { label: 'Custom...', kind: 'custom', delivery: 'inline' },
        { label: 'Custom... (Detached)', kind: 'custom', delivery: 'detached' },
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
            const branch = await showInputDialog({ title: 'Review vs Branch', label: 'Base branch to review against', value: 'main', confirmText: 'Review' });
            if (!branch) return;
            target = { type: 'baseBranch', branch: branch.trim() };
          } else if (option.kind === 'commit') {
            const sha = await showInputDialog({ title: 'Review Commit', label: 'Commit SHA to review', confirmText: 'Review' });
            if (!sha) return;
            target = { type: 'commit', sha: sha.trim() };
          } else if (option.kind === 'custom') {
            const instructions = await showInputDialog({ title: 'Custom Review', label: 'Review instructions', confirmText: 'Review', multiline: true });
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
