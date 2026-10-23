// THE NEW SESSION FORM IN TWO COLUMNS (lane new-session-form — the owner accepted POC v2.2, 2026-10-23; the spec is the POC's
// Main / Phone boards, the folding is SharedContext/vibespace-new-session-field-census.md). public/index.html holds the
// dialog's controls (every id kept: #input-backend / #input-mode are the values the switches set); this mixin draws what
// is NOT a plain control and keeps the facts PURE (src/lib/new-session-model.js):
//   header — the backend chip, the machine dot, the kind switch Agent | Terminal (it replaces the Mode row; there is no
//            New-Session road to a browser-only session, so no «Browser» kind is offered);
//   LEFT   — the backend as a segmented switch, the 「可用工具」 row ONLY where the harness declares a toolAllowlist
//            (claude's --allowedTools / --disallowedTools, codex's sandbox + approval), and the 「更多选项」 fold:
//            machine · account · additional arguments · git worktree, each unfolding by itself when the person's own
//            data says it matters (unfoldReasons); the fold's open state is remembered per device;
//   RIGHT  — 「能用什么」 (#ns-right): built-in (locked on), VibeSpace (sessions + the Task Group chips — several, in the
//            order picked — channels, the browser profiles the picked groups ADMIT, the vault / automation keys /
//            outside · notifications as read-only facts with their doors), 「账号 · 以你的身份」 (the channel accounts:
//            ONE list, the same assignment store the Channels window writes), MCP; 无 | 已选 | 全部 over the ticks;
//   FOOTER — why Create cannot run yet, in words; otherwise the run's values as chips (each opens its row; dashed while
//            its row is folded).
// The right column writes only EXISTING stores through their EXISTING verdicts: a ticked account becomes ONE access row
// {principal: this conversation, authority: draft} through PUT /api/channels/adapters/:id/access once the conversation's
// id exists (src/new-session-spec.js withCreateAccess); the profile list is the server's mayAttach (GET /api/browser/admits).
import { escHtml, fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { terminalOnly, toolAllowlistFor, toolAllowlistArgs, worktreeCapsFor } from './agent-meta.js';
import { grainState } from './channel-filter-editor.js';
import { openVaultWindow } from './vault-window.js';
import { withCreateAccess } from '../new-session-spec.js';
import { pendingBindVerdict } from './fork-groups.js'; // PURE: the task binds' rule — the session's OWN id, once announced
import { FOLD_ROWS, unfoldReasons, foldPlan, footerChips, createRefusal, toolCycle, toolPickOf, codexPreset, toolChipText, accountRows, tickState, bulkTick, toggleGroup, nameHint } from './new-session-model.js';

const FOLD_KEY = 'vs.newSession.moreOpen';   // a per-device UI pref: '1' = the fold is open
const FOLD_IDS = { host: 'row-host', account: 'row-account', args: 'row-extra-args', worktree: 'row-worktree' };
const FOLD_NAMES = { host: 'Machine', account: 'Account', args: 'Additional Arguments', worktree: 'git worktree' };
const $ = (id) => document.getElementById(id);
const ic = (k) => UI_ICONS[k] || '';
const GROUP_VIS = { visible: 'visible', messageable: 'messageable' };
/** A Task Group's own name (the store always holds a title; the id is its last word) — never a channel conversation. */
const groupName = (g) => String(g.title || g.id);

export function installNewSessionForm(App) {
  /** Once, at dialog setup: the anchors the fold rows return to, every delegated click. */
  App.prototype._nsSetup = function () {
    const dlg = $('dialog-new-session');
    if (!dlg || this._nsWired) return;
    this._nsWired = true;
    this._ns = { taskIds: [], ticks: {}, remembered: null, tools: {}, adapters: null, grains: {}, isGit: false, gitFor: '', cwd: null };
    for (const k of FOLD_ROWS) { const row = $(FOLD_IDS[k]); if (row && !row.__nsHome) { const a = document.createComment('ns-home:' + k); row.before(a); row.__nsHome = a; } }
    $('ns-more-toggle')?.addEventListener('click', () => {
      const b = $('ns-more-toggle'); const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      try { localStorage.setItem(FOLD_KEY, open ? '1' : '0'); } catch { /* a private window keeps it for the open */ }
    });
    $('ns-kind-seg')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-kind]'); if (!b || b.disabled) return;
      const sel = $('input-mode'); if (sel) sel.value = b.dataset.kind;
      this._nsRender();
    });
    $('ns-be-seg')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-backend]'); if (!b) return;
      const sel = $('input-backend'); if (!sel || sel.value === b.dataset.backend) return;
      sel.value = b.dataset.backend;
      sel.dispatchEvent(new Event('change', { bubbles: true }));   // the ONE road: applyBackend (wired at setup)
    });
    $('input-session-name')?.addEventListener('input', () => { try { this._cwdField?.refresh(); } catch { } });
    for (const id of ['input-model', 'input-effort', 'input-permission', 'input-account', 'input-extra-args', 'input-worktree', 'input-host', 'input-model-custom']) {
      $(id)?.addEventListener('change', () => this._nsRender());
    }
    $('input-extra-args')?.addEventListener('input', () => this._nsPaintFoot());
    $('row-tools')?.addEventListener('click', (e) => this._nsToolsClick(e));
    $('ns-foot-info')?.addEventListener('click', (e) => { const c = e.target.closest('[data-chip]'); if (c) this._nsReveal(c.dataset.chip); });
    $('ns-right')?.addEventListener('click', (e) => this._nsRightClick(e));
    $('ns-right')?.addEventListener('change', (e) => {
      const x = e.target.closest('input[data-acc]');
      if (x) { this._ns.ticks[x.dataset.acc] = !!x.checked; if (!x.checked) delete this._ns.ticks[x.dataset.acc]; this._nsRememberMix(); this._nsPaintRight(); }
    });
  };

  /** Every open (showNewSessionDialog): the picked groups, no ticks, the harness's own tool defaults, fresh stores. */
  App.prototype._nsOpen = function ({ taskIds = [] } = {}) {
    this._nsSetup();
    const known = new Set((this.sidebar?._tasks || []).map((g) => g.id));
    this._ns = { ...this._ns, taskIds: (Array.isArray(taskIds) ? taskIds : []).filter((id) => known.has(id)), ticks: {}, remembered: null, tools: {}, adapters: null, grains: {}, isGit: false, gitFor: '', cwd: null };
    this._nsAdmits = null; this._nsAdmitsAsk = null; // the profiles' admission is asked again on every open (their lists may have changed since)
    const more = $('ns-more-toggle');
    let open = false; try { open = localStorage.getItem(FOLD_KEY) === '1'; } catch { }
    more?.setAttribute('aria-expanded', String(open));
    this._nsLoadAccounts();
    this._nsRender();
  };

  /** The Task Groups picked, in the order picked (what Create sends as taskIds). */
  App.prototype._nsTaskIds = function () { return [...(this._ns?.taskIds || [])]; };
  App.prototype._nsGroups = function () { return this._nsTaskIds().map((id) => this.sidebar?._taskById?.(id)).filter(Boolean); };
  /** The contract's groupsOf for the path field: the picked groups (selection order, `selected: true`). */
  App.prototype._nsGroupsOf = function () {
    return this._nsGroups().map((g) => ({ id: g.id, name: groupName(g), color: this.sidebar?.getTaskColor?.(g) || g.color || '', folders: this.sidebar?._folderPaths?.(g) || [], context: g.contextDir || null, selected: true }));
  };
  App.prototype._nsSetGroups = function (ids, { why = 'pick' } = {}) {
    const before = this._nsTaskIds();
    this._ns.taskIds = ids;
    // the first group picked fills an EMPTY folder with its first folder (a typed path is never clobbered)
    const added = ids.find((id) => !before.includes(id));
    if (added && !before.length) {
      const g = this.sidebar?._taskById?.(added); const first = g && (this.sidebar?._folderPaths?.(g) || [])[0];
      const cwd = $('input-cwd'); if (first && cwd && !cwd.value.trim()) { if (this._cwdField) this._cwdField.set(first); else cwd.value = first; }
    }
    try { window.__vsOp?.('ns-groups', { n: ids.length, why }); } catch { }
    this._fillBrowserProfileRow?.(ids);
    try { this._cwdField?.refresh(); } catch { }
    this._nsRender();
  };

  /** The 「可用工具」 pick the create sends (null = the harness's own settings stand). */
  App.prototype._nsToolPick = function () {
    const be = $('input-backend')?.value || 'claude';
    return toolPickOf(toolAllowlistFor(be), this._ns?.tools || {});
  };
  /** The accounts ticked for THIS conversation (rows a picked group already grants are not ticks). */
  App.prototype._nsChannelTicks = function () {
    const rows = accountRows(this._ns?.adapters || [], this._ns?.grains || {}, this._nsTaskIds());
    return rows.filter((r) => !r.granted && this._ns.ticks[r.id]).map((r) => ({ id: r.id, label: r.label }));
  };

  /** The path field told us (contract onState) — the footer's refusal, the name's placeholder, the git probe. */
  App.prototype._nsCwdState = function (v) {
    if (!this._ns) return;
    this._ns.cwd = v || null;
    const name = $('input-session-name');
    if (name) name.placeholder = (v && v.status === 'ok' && nameHint(v.path)) || t('My Project');
    if (v && v.status === 'ok') this._nsProbeGit(v.path);
    this._nsPaintFoot();
  };
  App.prototype._nsProbeGit = function (path) {
    const host = $('input-host')?.value || '';
    const key = host + '\u0000' + path;
    if (!path || this._ns.gitFor === key) return;
    this._ns.gitFor = key; this._ns.isGit = false;
    clearTimeout(this._nsGitTimer);
    this._nsGitTimer = setTimeout(async () => {
      const q = `/api/file/info?path=${encodeURIComponent(String(path).replace(/\/+$/, '') + '/.git')}${host ? `&host=${encodeURIComponent(host)}` : ''}`;
      const r = await fetchJson(q);
      if (this._ns.gitFor !== key) return;
      this._ns.isGit = !!(r && !r.error);
      this._nsPlaceFold();
      this._nsPaintFoot();
    }, 250);
  };

  /** Everything derived from the dialog's choices, drawn again. */
  App.prototype._nsRender = function () {
    if (!this._ns || !$('dialog-new-session')) return;
    const be = $('input-backend')?.value || 'claude';
    const shell = terminalOnly(be);
    // the header
    const chip = $('ns-be-chip'); if (chip) chip.textContent = shell ? 'shell' : be;
    const hostSel = $('input-host');
    const hostName = hostSel && hostSel.value ? (hostSel.selectedOptions[0]?.textContent || hostSel.value).replace(/\s*\(.*$/, '') : t('This machine');
    const dot = document.querySelector('#ns-host-dot .ns-host-name'); if (dot) dot.textContent = hostName;
    // the backend switch: the options the select offers (a harness not installed is a hidden option — not offered)
    const seg = $('ns-be-seg'); const sel = $('input-backend');
    if (seg && sel) {
      const opts = [...sel.options].filter((o) => !o.hidden);
      const sig = opts.map((o) => o.value + ':' + o.textContent).join('|');
      if (seg.dataset.sig !== sig) { seg.dataset.sig = sig; seg.innerHTML = opts.map((o) => `<button type="button" data-backend="${escHtml(o.value)}">${escHtml(o.textContent)}</button>`).join(''); }
      for (const b of seg.querySelectorAll('button')) { const on = b.dataset.backend === sel.value; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    }
    // the kind switch (a plain shell has no agent: Terminal, always)
    const mode = $('input-mode');
    if (shell && mode) mode.value = 'terminal';
    for (const b of document.querySelectorAll('#ns-kind-seg button')) {
      const on = b.dataset.kind === (mode?.value || 'chat');
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      b.disabled = shell && b.dataset.kind === 'chat';
      b.title = b.disabled ? t('A plain shell has no agent') : '';
    }
    $('row-model')?.closest('.ns-pair')?.classList.toggle('hidden', shell);
    this._nsPaintTools();
    this._nsPlaceFold();
    this._nsPaintRight();
    this._nsPaintFoot();
  };

  // ── LEFT: 可用工具 ──────────────────────────────────────────────────────────
  App.prototype._nsPaintTools = function () {
    const box = $('row-tools'); if (!box) return;
    const be = $('input-backend')?.value || 'claude';
    const row = terminalOnly(be) ? null : toolAllowlistFor(be);
    box.classList.toggle('hidden', !row);
    if (!row) { box.innerHTML = ''; box.dataset.kind = ''; return; }
    const st = this._ns.tools;
    const perm = $('input-permission')?.value || '';
    const pick = toolPickOf(row, st);
    const ans = toolAllowlistArgs({ backend: be, pick: pick || {} });
    const reset = `<button type="button" class="ns-link" data-tools-reset ${pick ? '' : 'disabled'} title="${escHtml(t('Back to the harness’s own settings'))}">${escHtml(t('Default'))}</button>`;
    const cmd = (args) => args.map((a) => (/[ ,]/.test(a) ? `"${a}"` : a)).join(' ');
    box.dataset.kind = row.kind;
    if (row.kind === 'tools') {
      const chips = row.tools.map((x) => {
        const s = st[x] || ''; const keep = (row.keep || []).includes(x);
        const words = s === 'allow' ? t('allowed, asks no more') : s === 'deny' ? t('removed') : t('default');
        const tip = keep ? t('Bash cannot be ✗: the vibespace-status / msg / task reporting tools run through Bash — their allow rules are always kept') : t('Click: default → ✓ allow (asks no more) → ✗ remove → default');
        return `<button type="button" class="ns-tool-chip${s ? ' ' + s : ''}" data-tool="${escHtml(x)}" aria-label="${escHtml(x + ': ' + words)}" title="${escHtml(tip)}">${s === 'allow' ? '<b>✓</b>' : s === 'deny' ? '<b>✗</b>' : ''}${escHtml(x)}${keep ? `<span class="ns-keep" aria-hidden="true">${ic('lock')}</span>` : ''}</button>`;
      }).join('');
      const warn = [];
      if (pick && pick.allow.length && perm === 'bypassPermissions') warn.push(t('Permission mode is bypass: a ✓ changes nothing (nothing asks anyway); a ✗ still removes the tool'));
      box.innerHTML = `<span class="ns-lab">${escHtml(t('Available tools'))} <span class="ns-lab-hint">${escHtml(t('Claude Code’s own switch — not a VibeSpace rule'))}</span>${reset}</span>
        <div class="ns-tool-chips" role="group" aria-label="${escHtml(t('Available tools'))}">${chips}</div>
        <div class="ns-tool-flags" id="ns-tool-flags">${ans.dirty ? `${escHtml(t('Adds to the command line:'))} <code>${escHtml(cmd(ans.args))}</code>` : escHtml(t('Default: which tools ask and which just run is Claude Code’s own settings plus the permission mode above'))}</div>
        <div class="ns-tool-flags">${ic('lock')} ${escHtml(t('Bash cannot be ✗: the vibespace-status / msg / task reporting tools run through Bash — their allow rules are always kept'))}</div>
        ${warn.map((w) => `<div class="ns-tool-warn">${escHtml(w)}</div>`).join('')}`;
      return;
    }
    const preset = codexPreset(perm);
    const sb = st.sandbox || preset.sandbox, ap = st.approval || preset.approval;
    const seg2 = (k, vals, cur, def) => `<span class="ns-seg ns-small" role="group" aria-label="${escHtml(k === 'sandbox' ? t('Sandbox') : t('Approval'))}">${vals.map((v) => `<button type="button" class="${v === cur ? 'on' : ''}" data-codex="${k}" data-v="${escHtml(v)}" aria-pressed="${v === cur}" title="${v === def ? escHtml(t('the permission mode’s default')) : ''}">${escHtml(v)}${v === def ? `<i>${escHtml(t('·default'))}</i>` : ''}</button>`).join('')}</span>`;
    const full = toolAllowlistArgs({ backend: be, pick: { sandbox: sb, approval: ap } });
    box.innerHTML = `<span class="ns-lab">${escHtml(t('Available tools'))} <span class="ns-lab-hint">${escHtml(t('Codex’s own sandbox and approval — the default follows the permission mode'))}</span>${reset}</span>
      <div class="ns-codex-tools"><span class="ns-ck">${escHtml(t('Sandbox'))}</span>${seg2('sandbox', row.sandbox, sb, preset.sandbox)}<span class="ns-ck">${escHtml(t('Approval'))}</span>${seg2('approval', row.approval, ap, preset.approval)}</div>
      <div class="ns-tool-flags" id="ns-tool-flags">${escHtml(t('Command line:'))} <code>${escHtml(cmd(full.args))}</code>${pick ? '' : ' ' + escHtml(t('(the permission mode’s default)'))}</div>`;
  };
  App.prototype._nsToolsClick = function (e) {
    const be = $('input-backend')?.value || 'claude';
    const row = toolAllowlistFor(be); if (!row) return;
    if (e.target.closest('[data-tools-reset]')) { this._ns.tools = {}; this._nsRender(); return; }
    const chip = e.target.closest('[data-tool]');
    if (chip) {
      const x = chip.dataset.tool; const next = toolCycle(row, x, this._ns.tools[x] || '');
      if (next) this._ns.tools[x] = next; else delete this._ns.tools[x];
      this._nsRender();
      $('row-tools')?.querySelector(`[data-tool="${CSS.escape(x)}"]`)?.focus();
      return;
    }
    const cx = e.target.closest('[data-codex]');
    if (cx) {
      const k = cx.dataset.codex, v = cx.dataset.v;
      const preset = codexPreset($('input-permission')?.value || '');
      if (v === preset[k]) delete this._ns.tools[k]; else this._ns.tools[k] = v;   // the mode's own value is no pick
      this._nsRender();
    }
  };

  // ── LEFT: the fold ──────────────────────────────────────────────────────────
  App.prototype._nsPresentRows = function () {
    const be = $('input-backend')?.value || 'claude';
    const shell = terminalOnly(be);
    const present = ['host'];
    const acct = $('row-account'); if (acct && acct.style.display !== 'none') present.push('account');
    if (!shell) present.push('args');
    if (!shell && worktreeCapsFor(be).supported) present.push('worktree');
    return present;
  };
  App.prototype._nsWhy = function () {
    const acctSel = $('input-account');
    const nAcc = acctSel ? Math.max(0, [...acctSel.options].length - 2) : 0;   // Default + the machine login, then one per account
    const why = unfoldReasons({ sessions: this.sidebar?._allSessions || [], hosts: this._nsHosts || [], accounts: nAcc, isGit: !!this._ns.isGit });
    if ($('input-host')?.value && !why.host) why.host = $('input-host').selectedOptions[0]?.textContent || $('input-host').value;   // opened ON a machine
    if ($('input-worktree')?.checked) why.worktree = why.worktree || true;
    return why;
  };
  App.prototype._nsPlaceFold = function () {
    const body = $('ns-more-body'), more = $('ns-more'); if (!body || !more) return;
    const why = this._nsWhy();
    const { up, folded } = foldPlan({ present: this._nsPresentRows(), why });
    this._ns.folded = folded;
    for (const k of FOLD_ROWS) {
      const row = $(FOLD_IDS[k]); if (!row || !row.__nsHome) continue;
      if (up.includes(k)) { if (row.previousSibling !== row.__nsHome) row.__nsHome.after(row); }
      else if (folded.includes(k)) body.appendChild(row);
      else if (row.previousSibling !== row.__nsHome) row.__nsHome.after(row);   // not offered: home (its own rule hides it)
      const note = row.querySelector(':scope > .ns-auto-note');
      const words = up.includes(k) ? this._nsWhyWords(k, why) : '';
      if (words && !note) row.insertAdjacentHTML('beforeend', `<span class="ns-auto-note">${escHtml(words)}</span>`);
      else if (note) { if (words) note.textContent = words; else note.remove(); }
    }
    more.classList.toggle('hidden', !folded.length);
    const names = $('ns-more-names'); if (names) names.textContent = folded.map((k) => t(FOLD_NAMES[k])).join(' · ');
  };
  App.prototype._nsWhyWords = function (k, why) {
    if (k === 'host' && why.host) return t('Opened by itself: {why}', { why: t('a paired machine “{name}” is in use', { name: String(why.host).replace(/\s*\(.*$/, '') }) });
    if (k === 'account' && why.account) return t('Opened by itself: {why}', { why: t('you have {n} accounts', { n: why.account }) });
    if (k === 'worktree' && why.worktree && this._ns.isGit) return t('Opened by itself: {why}', { why: t('this folder is a git repository') });
    return '';
  };
  /** A footer chip's press: its row, unfolded when it is folded, scrolled to, its control focused. */
  App.prototype._nsReveal = function (k) {
    const ids = { backend: 'ns-be-seg', model: 'input-model', effort: 'input-effort', permission: 'input-permission', tools: 'row-tools', kind: 'ns-kind-seg', host: 'input-host', account: 'input-account', args: 'input-extra-args', worktree: 'input-worktree', cwd: 'input-cwd' };
    const target = $(ids[k]); if (!target) return;
    if ((this._ns.folded || []).includes(k)) { $('ns-more-toggle')?.setAttribute('aria-expanded', 'true'); }
    const row = target.closest('label, .ns-row, .ns-seg') || target;
    try { row.scrollIntoView({ block: 'nearest' }); } catch { }
    (target.matches('input, select, button') ? target : target.querySelector('input, select, button'))?.focus();
    row.classList.add('ns-flash'); setTimeout(() => row.classList.remove('ns-flash'), 900);
  };

  // ── FOOTER ──────────────────────────────────────────────────────────────────
  App.prototype._nsRefusal = function () {
    const be = $('input-backend')?.value || 'claude';
    return createRefusal({ cwd: this._ns?.cwd || this._cwdField?.verdict?.() || null, modelsNone: !!document.querySelector('#row-model .ns-models-none:not(.hidden)'), noAgent: terminalOnly(be) });
  };
  App.prototype._nsPaintFoot = function () {
    const box = $('ns-foot-info'); if (!box || !this._ns) return;
    const no = this._nsRefusal();
    if (no) { box.innerHTML = `<span class="ns-refuse" role="status">✕ ${escHtml(t('Cannot create yet: {why}', { why: no.text || t(no.key) }))}</span>`; box.dataset.refused = no.row; return; }
    box.dataset.refused = '';
    const be = $('input-backend')?.value || 'claude';
    const shell = terminalOnly(be);
    const sel = $('input-backend'); const modelSel = $('input-model');
    const model = modelSel?.value === '__custom__' ? ($('input-model-custom')?.value.trim() || '') : (modelSel?.value || '');
    const acctRow = $('row-account'); const acct = $('input-account');
    const hostSel = $('input-host');
    const row = toolAllowlistFor(be);
    const chips = footerChips({
      backend: be, backendLabel: sel?.selectedOptions[0]?.textContent || be, shell, model, effortRow: !$('row-effort')?.classList.contains('hidden'), effort: $('input-effort')?.value || '',
      permission: $('input-permission')?.value || '', tools: shell ? '' : toolChipText(row, this._nsToolPick()), kind: $('input-mode')?.value || 'chat',
      hostRow: true, hostName: hostSel && hostSel.value ? (hostSel.selectedOptions[0]?.textContent || '').replace(/\s*\(.*$/, '') : '',
      accountRow: !!acctRow && acctRow.style.display !== 'none', account: acct && acct.value ? (acct.selectedOptions[0]?.textContent || '').slice(0, 32) : '',
      argsRow: !shell, args: $('input-extra-args')?.value.trim() || '', worktreeRow: !shell && worktreeCapsFor(be).supported, worktree: !!$('input-worktree')?.checked,
    }, this._ns.folded || []);
    box.innerHTML = chips.map((c) => `<button type="button" class="ns-chip${c.cls ? ' ' + c.cls : ''}${c.folded ? ' folded' : ''}" data-chip="${c.row}" title="${escHtml(t('Change this'))}">${escHtml(c.word ? t(c.text) : c.text)}</button>`).join('');
  };

  // ── RIGHT: 能用什么 ──────────────────────────────────────────────────────────
  App.prototype._nsLoadAccounts = async function () {
    const seq = (this._nsAccSeq = (this._nsAccSeq || 0) + 1);
    const d = await fetchJson('/api/channels?scope=accounts');
    if (seq !== this._nsAccSeq) return;
    const adapters = d && Array.isArray(d.adapters) ? d.adapters.filter((a) => a && !a.builtin && a.listed !== false) : [];
    const grains = {};
    await Promise.all(adapters.map(async (a) => {
      const v = await fetchJson(`/api/channels/adapters/${encodeURIComponent(a.id)}/view`);
      grains[a.id] = v && v.adapter && v.adapter.accountGrain && Array.isArray(v.adapter.accountGrain.access) ? v.adapter.accountGrain.access : [];
    }));
    if (seq !== this._nsAccSeq || !this._ns) return;
    this._ns.adapters = adapters; this._ns.grains = grains;
    this._nsPaintRight();
  };
  App.prototype._nsRememberMix = function () {
    const rows = accountRows(this._ns.adapters || [], this._ns.grains || {}, this._nsTaskIds());
    if (tickState(rows, this._ns.ticks) === 'some') this._ns.remembered = { ...this._ns.ticks };
  };
  App.prototype._nsRightClick = function (e) {
    const tick = e.target.closest('[data-tick-all]');
    if (tick && !tick.disabled) {
      const rows = accountRows(this._ns.adapters || [], this._ns.grains || {}, this._nsTaskIds());
      this._ns.ticks = bulkTick(rows, this._ns.ticks, tick.dataset.tickAll, this._ns.remembered);
      this._nsPaintRight(); return;
    }
    const x = e.target.closest('[data-tg-x]');
    if (x) { this._nsSetGroups(this._nsTaskIds().filter((id) => id !== x.dataset.tgX), { why: 'remove' }); return; }
    if (e.target.closest('[data-tg-add]')) { this._nsGroupMenu(e.target.closest('[data-tg-add]')); return; }
    const door = e.target.closest('[data-door]');
    if (door) { e.preventDefault(); this._nsDoor(door.dataset.door, door.dataset); }
  };
  /** A door: the store's own window (the dialog closes — the person goes there to change it). */
  App.prototype._nsDoor = function (door, ds = {}) {
    this.hideDialogs();
    if (door === 'vault' || door === 'keys') openVaultWindow(this);
    else if (door === 'chan') this.openChannel?.(ds.acc || undefined);
    else if (door === 'integrations') this.openIntegration?.();
    else if (door === 'group' && ds.tid) this.openTaskDetail?.(ds.tid);
  };
  /** The 任务组 menu: every group, a tick and its order for the picked ones; a press picks / unpicks. */
  App.prototype._nsGroupMenu = function (anchor) {
    document.querySelectorAll('.ns-tg-menu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'ns-tg-menu'; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-multiselectable', 'true'); menu.setAttribute('data-popover', '');
    const draw = () => {
      const picked = this._nsTaskIds();
      menu.innerHTML = (this.sidebar?._taskBoardOrder?.() || []).filter((g) => !g.archived || picked.includes(g.id)).map((g) => {
        const i = picked.indexOf(g.id);
        return `<button type="button" class="ns-tg-item${i >= 0 ? ' on' : ''}" role="option" aria-selected="${i >= 0}" data-tg="${escHtml(g.id)}"><span class="ns-tg-ord">${i >= 0 ? i + 1 : ''}</span><span class="tvg-dot" style="--g-color:${escHtml(this.sidebar?.getTaskColor?.(g) || g.color || '')}"></span><span>${escHtml(groupName(g))}</span></button>`;
      }).join('') || `<div class="ns-pv-via dim">${escHtml(t('No Task Groups yet'))}</div>`;
    };
    draw();
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-tg]'); if (!b) return; this._nsSetGroups(toggleGroup(this._nsTaskIds(), b.dataset.tg), { why: 'pick' }); draw(); });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = (r.bottom + 4 + menu.offsetHeight > innerHeight ? Math.max(8, r.top - menu.offsetHeight - 4) : r.bottom + 4) + 'px';
    const off = (e) => { if (!menu.contains(e.target) && e.target !== anchor) { menu.remove(); document.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  };
  App.prototype._nsPaintRight = function () {
    const box = $('ns-right'); if (!box || !this._ns) return;
    const be = $('input-backend')?.value || 'claude';
    const shell = terminalOnly(be);
    const bprof = $('row-browser-profile');
    if (bprof) bprof.remove();   // kept across the redraw (its select is what Create reads)
    const prov = (o) => `<div class="ns-prov${o.cls ? ' ' + o.cls : ''}" ${o.data || ''}><span class="ns-pv-tick">${o.tick}</span><span class="ns-pv-name">${o.name}</span><span class="ns-pv-what">${o.what}</span><span class="ns-pv-end">${o.end || ''}</span>${o.sub ? `<div class="ns-pv-sub">${o.sub}</div>` : ''}</div>`;
    const on = `<span class="ns-on">${escHtml(t('On'))}</span>`;
    const doorBtn = (door, label, extra = '') => `<button type="button" class="ns-link" data-door="${door}" ${extra}>${escHtml(label)} ›</button>`;
    const fact = (key, name, what, door, label, extra) => prov({ cls: 'fact', data: `data-fact="${key}"`, tick: ic('info'), name: escHtml(name), what: escHtml(what), end: door ? doorBtn(door, label, extra) : '' });
    if (shell) {
      box.innerHTML = `<div class="ns-col-h"><b>${escHtml(t('What it may use'))}</b></div><div class="ns-pv-via dim">${escHtml(t('A plain shell has no agent — nothing here applies'))}</div>`;
      if (bprof) box.appendChild(bprof);
      return;
    }
    const groups = this._nsGroups();
    const rows = accountRows(this._ns.adapters || [], this._ns.grains || {}, this._nsTaskIds());
    const ts = tickState(rows, this._ns.ticks);
    const tickable = rows.filter((r) => !r.granted).length;
    const seg = `<span class="ns-seg ns-tick-seg" role="group" aria-label="${escHtml(t('Tick none, the picked or all'))}">${[['none', 'None'], ['some', 'Selected'], ['all', 'All']].map(([v, l]) => `<button type="button" data-tick-all="${v}" class="${ts === v ? 'on' : ''}" aria-pressed="${ts === v}" ${!tickable || (v === 'some' && !this._ns.remembered && ts !== 'some') ? 'disabled' : ''}>${escHtml(t(l))}</button>`).join('')}</span>`;
    const head = `<div class="ns-col-h"><b>${escHtml(t('What it may use'))}</b><span>${escHtml(t('Tick what the agent may use — VibeSpace’s own records'))}</span>${seg}</div>`;
    const builtin = `<div class="ns-card-h"><i class="ns-dot"></i>${escHtml(t('Built in · always on'))}</div><div class="ns-card ns-builtin">${[
      ['artifacts', t('Artifacts it makes'), t('The files it writes, shown in this conversation’s Artifacts')],
      ['feedback', t('Feedback'), t('Tells the maintainers where a tool felt wrong (vibespace-feedback)')],
      ['pages', t('Page publishing'), t('Publishes a page on this VibeSpace (vibespace pages)')],
    ].map(([k, n, w]) => prov({ cls: 'locked', data: `data-builtin="${k}"`, tick: ic('lock'), name: escHtml(n), what: escHtml(w), end: on })).join('')}</div>`;
    // VibeSpace: sessions + the Task Group chips (their reach), channels, the browser, the facts
    const allGroups = this.sidebar?._taskBoardOrder?.() || [];
    const chips = groups.map((g, i) => `<span class="ns-tg-chip" style="--g-color:${escHtml(this.sidebar?.getTaskColor?.(g) || g.color || '')}" title="${escHtml((groupName(g)) + ' · ' + g.id)}" data-tg-chip="${escHtml(g.id)}"><span class="ns-tg-n">${i + 1}</span><span class="ns-tg-name">${escHtml(groupName(g))}</span><button type="button" data-tg-x="${escHtml(g.id)}" aria-label="${escHtml(t('Remove “{name}”', { name: groupName(g) }))}">×</button></span>`).join('');
    const taskRow = allGroups.length ? `<div class="ns-pv-subrow" data-row="task"><span class="ns-pv-subk">${escHtml(t('Task Groups'))} <span class="ns-lab-hint">${escHtml(t('several allowed'))}</span></span><div class="ns-tg-box" id="ns-tg-box" role="group" aria-label="${escHtml(t('Task Groups (several allowed)'))}">${chips}<button type="button" class="ns-tg-add" data-tg-add>${escHtml(groups.length ? '+' : t('+ Pick Task Groups'))}</button></div></div>` : '';
    const members = (g) => { try { return this.sidebar?._getTaskSessionKeys?.(g, this.sidebar?._allSessions || [])?.size || 0; } catch { return 0; } };
    const reach = groups.length
      ? groups.map((g) => `<div class="ns-pv-via">${escHtml(t('Through Task Group “{name}”: can see and message its {n} member(s)', { name: groupName(g), n: members(g) }))}</div>`).join('')
      : `<div class="ns-pv-via dim">${escHtml(t('No Task Group — it only reaches the sessions it starts itself'))}</div>`;
    const vs = [prov({ cls: 'locked', data: 'data-row="sessions"', tick: ic('lock'), name: escHtml(t('Sessions')), what: escHtml(t('Read, message, start new ones')), end: on, sub: taskRow + reach })];
    vs.push(prov({ cls: 'fact', data: 'data-row="chan"', tick: ic('chat'), name: escHtml(t('Channels')), what: escHtml(t('Inbox: read, search, draft — through the accounts ticked under «Accounts · as you» (the same assignment record, not a second list)')) }));
    const hostSel = $('input-host');
    if (hostSel && hostSel.value) vs.push(fact('bprof', t('Browser'), t('Sessions on {host} cannot use this machine’s browser profiles', { host: (hostSel.selectedOptions[0]?.textContent || hostSel.value).replace(/\s*\(.*$/, '') })));
    else if (bprof && bprof.style.display !== 'none') {
      const hidden = Number(bprof.dataset.hiddenCount || 0);
      vs.push(prov({ data: 'data-row="bprof"', tick: ic('globe'), name: escHtml(t('Browser')), what: escHtml(t('Opens a browser with a profile')),
        sub: `<div class="ns-pv-subrow"><span class="ns-pv-subk">${escHtml(t('Profile'))}</span><span data-slot="bprof"></span></div><div class="ns-pv-via dim">${escHtml(t('Only the profiles open to this conversation (or its Task Groups) are listed'))}${hidden ? escHtml(t(' · {n} more are not open to it', { n: hidden })) : ''}</div>` }));
    }
    vs.push(fact('vault', t('Vault'), t('2FA codes and security keys (passkeys) — by purpose: the agent gets the purpose, never the value'), 'vault', t('Vault')));
    vs.push(fact('keys', t('Automation keys'), t('Who may use which key is set in the Automation keys window'), 'keys', t('Automation keys')));
    const NOTIFY = (v) => (v === true ? t('on') : v === false ? t('off') : t('follow the global setting'));
    const outside = groups.length ? groups.map((g) => t('“{name}”: outside {vis} · notifications {notify}', { name: groupName(g), vis: GROUP_VIS[g.externalVisibility] ? t(GROUP_VIS[g.externalVisibility]) : t('closed'), notify: NOTIFY(g.jobNotify) })).join('; ') : t('No Task Group — closed to the outside, notifications follow the global setting');
    vs.push(fact('group', t('Outside · notifications'), outside, groups.length ? 'group' : '', t('Task Group settings'), groups.length ? `data-tid="${escHtml(groups[0].id)}"` : ''));
    const vsCard = `<div class="ns-card-h">VibeSpace</div><div class="ns-card" data-card="vibespace">${vs.join('')}</div>`;
    // 账号 · 以你的身份 — ONE list (the channel accounts), the same store the Channels window writes
    const AUTH = (a) => (a === 'send' ? t('can send') : t('draft only'));
    const acctRows = rows.map((r) => {
      const kind = `<span class="ns-chan-k">${escHtml(r.vendor || r.kind)}</span>`;
      if (r.granted) {
        const via = r.everyone ? t('All agents · {authority}', { authority: AUTH(r.authority) }) : t('Through Task Group “{names}” · {authority}', { names: r.groups.map((id) => groupName(this.sidebar?._taskById?.(id) || { id })).join('」「'), authority: AUTH(r.authority) });
        return prov({ cls: 'acct locked', data: `data-acc-row="${escHtml(r.id)}"`, tick: `<input type="checkbox" checked disabled aria-label="${escHtml(t('“{name}” comes through its Task Group', { name: r.label }))}">`, name: kind + escHtml(r.label), what: '', sub: `<div class="ns-pv-via">${escHtml(via)}</div>` });
      }
      const ticked = !!this._ns.ticks[r.id];
      return prov({ cls: 'acct' + (ticked ? ' on' : ''), data: `data-acc-row="${escHtml(r.id)}"`, tick: `<input type="checkbox" data-acc="${escHtml(r.id)}" ${ticked ? 'checked' : ''} aria-label="${escHtml(t('Let this conversation see “{name}”', { name: r.label }))}">`, name: kind + escHtml(r.label), what: '',
        sub: `<div class="ns-pv-via${ticked ? ' ok' : ' dim'}">${escHtml(ticked ? t('Written into the channel assignment at create: this conversation · draft only') : t('Not assigned to the picked Task Groups'))} ${doorBtn('chan', t('Assign in the Channels window'), `data-acc="${escHtml(r.id)}"`)}</div>` });
    }).join('');
    const acctCard = `<div class="ns-card-h">${escHtml(t('Accounts · as you'))} <span class="ns-hint">${escHtml(t('anything unassigned stays invisible'))}</span></div><div class="ns-card" data-card="accounts">${acctRows || fact('noacc', t('Accounts'), this._ns.adapters ? t('No account connected yet') : t('Reading the accounts…'), 'integrations', t('Integrations'))}</div>`;
    const mcp = `<div class="ns-card-h">${escHtml(t('MCP servers'))}</div><div class="ns-card">${fact('mcp', 'MCP', t('None yet — add them in Integrations'), 'integrations', t('Integrations'))}</div>`;
    const foot = `<div class="ns-reach-foot">${ic('info')} <span>${escHtml(t('A new conversation gets only what its Task Groups already grant; what you tick here is written into the same permission record'))}</span></div>`;
    box.innerHTML = head + builtin + vsCard + acctCard + mcp + foot;
    const slot = box.querySelector('[data-slot="bprof"]');
    if (bprof) (slot || box).appendChild(bprof);
  };

  /** Create answered (createSession's onCreateResult): the grants that wait for the conversation's own id. */
  App.prototype._nsCreated = function (msg, { channels = [] } = {}) {
    if (!msg || !msg.sessionId) return;
    if (!channels.length && !msg.toolPick) return;
    (this._nsPendingGrants ??= new Map()).set(msg.sessionId, { channels, toolPick: msg.toolPick || null, at: Date.now() });
  };
  /** The id exists now — THE TASK BINDS' OWN RULE (src/lib/fork-groups.js pendingBindVerdict over the live list: the
   *  session's OWN id, once the harness announced it; listed-then-gone drops it): the 「可用工具」 pick becomes the
   *  conversation's own config (its resume re-passes it), each ticked account ONE access row through the access route.
   *  Asked from syncSessionIdentity (the moment a typed name becomes the custom name). */
  App.prototype._nsGrantPending = function (webuiId) {
    const p = this._nsPendingGrants?.get(webuiId);
    if (!p) return;
    const live = (this.sidebar?._webuiSessions || []).find((s) => s.id === webuiId);
    const v = pendingBindVerdict(p, live);
    if (v.drop) { this._nsPendingGrants.delete(webuiId); return; }
    if (live && !p.seen) p.seen = true;
    if (v.wait) return;
    this._nsPendingGrants.delete(webuiId);
    const cid = v.sessionKey.slice(v.sessionKey.indexOf(':') + 1);
    const key = { backend: live.backend || 'claude', backendSessionId: cid };
    if (p.toolPick) { try { this.sidebar?.setSessionConfig?.(key, { ...(this.sidebar?.getSessionConfig?.(key) || {}), tools: p.toolPick }); } catch { } }
    for (const acc of p.channels) this._nsWriteAccess(acc, cid);
  };
  App.prototype._nsWriteAccess = async function (acc, cid, again = true) {
    const st = await grainState({ kind: 'account', adapter: { id: acc.id } });
    if (!st) return;
    const access = withCreateAccess(st.access, cid);
    if (!access) return;   // it already holds a row there
    const r = await fetchJson(`/api/channels/adapters/${encodeURIComponent(acc.id)}/access`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access, base: st.stamp }) });
    if (r && r.ok) { try { window.__vsOp?.('ns-access', { adapter: acc.id }); } catch { } return; }
    if (r && r.code === 'grain-changed' && again) return this._nsWriteAccess(acc, cid, false);   // the list moved since the read: read it again, once
    showToast(t('Could not open “{name}” to this conversation: {why}', { name: acc.label || acc.id, why: (r && (r.error || r.code)) || t('server unreachable') }), { type: 'error', duration: 9000 });
  };
}
