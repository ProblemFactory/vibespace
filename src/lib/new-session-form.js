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
//   FOLDER — where it came from (lane new-session-group-folder-link, PURE folderOn*): the first picked group's folder is
//            DERIVED — it follows every group change until the person types, picks or presses a chip; the field shows it
//            through setDerived, its line saying which group gave it;
//   RIGHT  — 「能用什么」 (#ns-right): built-in (locked on), VibeSpace (sessions — its sentence READS the left column's
//            任务组 row — channels with one tick per account (the same assignment store the Channels window writes; a
//            group grant ticked and locked with its 「除了」), the browser profiles the picked groups ADMIT, the vault /
//            automation keys as read-only facts with their doors);
//   v3     — lane new-session-layout-v3-build (the owner nodded the POC, 2026-10-23 「都按你推荐吧」): 任务组 is the LEFT
//            column's row under the name (membership is a first-class field beside the name: the chips keyed and patched
//            in place, a sentence saying what it brings); ONE CHOICE, ONE PLACE — the header's Agent | Terminal is the
//            only mode door (Terminal = a login shell, no harness: the backend card is not drawn, the fold keeps the
//            machine, the right column keeps 「会话」 + one sentence), the harness's own terminal UI is the fold's tick
//            「用 harness 自己的终端界面跑」 (#input-tui → #input-mode terminal, ws-create's pty-wrapper road); gone: the
//            «终端（纯 shell）» backend chip, 无 | 已选 | 全部, the MCP empty row, 「对外 · 通知」 (the Task Group window's),
//            the separate 「账号 · 以你的身份」 card. THE PHONE (≤ 768 px, the design lane's phone addendum): a full-screen
//            sheet (the header and the footer fixed), the right column an ACCORDION (one line per resource: what is settled
//            + what is left), the group picker a bottom sheet, the backend a native select;
//   FOOTER — why Create cannot run yet, in words; otherwise the run's values as chips (each opens its row; dashed while
//            its row is folded).
// The right column writes only EXISTING stores through their EXISTING verdicts: a ticked account becomes ONE access row
// {principal: this conversation, authority: draft} through PUT /api/channels/adapters/:id/access once the conversation's
// id exists (src/new-session-spec.js withCreateAccess); the profile list is the server's mayAttach (GET /api/browser/admits).
import { escHtml, fetchJson, showToast } from './utils.js';
import { t, tc, resolveLang } from './i18n.js';
import { sessionDisplayName } from '../session-name.js';
import { UI_ICONS } from './icons.js';
import { terminalOnly, toolAllowlistFor, toolAllowlistArgs, worktreeCapsFor } from './agent-meta.js';
import { grainState } from './channel-filter-editor.js';
import { openVaultWindow } from './vault-window.js';
import { withCreateAccess } from '../new-session-spec.js';
import { pendingBindVerdict } from './fork-groups.js'; // PURE: the task binds' rule — the session's OWN id, once announced
import { FOLD_ROWS, unfoldReasons, foldPlan, footerChips, createRefusal, toolCycle, toolPickOf, codexPreset, toolChipText, accountRows, toggleGroup, groupReach, resourceSummary, nameHint, folderOnOpen, folderOnGroups, folderOnEdit, folderOnCommit, folderOnLeave, folderShows } from './new-session-model.js';

const FOLD_KEY = 'vs.newSession.moreOpen';   // a per-device UI pref: '1' = the fold is open
const FOLD_IDS = { host: 'row-host', account: 'row-account', args: 'row-extra-args', worktree: 'row-worktree', tui: 'row-tui' };
const FOLD_NAMES = { host: 'Machine', account: 'Account', args: 'Additional Arguments', worktree: 'git worktree', tui: 'Terminal UI' };
const $ = (id) => document.getElementById(id);
const ic = (k) => UI_ICONS[k] || '';
/** A Task Group's own name (the store always holds a title; the id is its last word) — never a channel conversation. */
const groupName = (g) => String(g.title || g.id);
/** The phone sheet — the stylesheet's own breakpoint, asked live (app.isMobile is read once, at boot). */
const narrow = () => !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
/** Names in quotes, the language's way (「X」「Y」 · “X”, “Y”). */
const quoted = (names) => names.map((n) => t('“{name}”', { name: n })).join(resolveLang() === 'en' ? ', ' : '');

export function installNewSessionForm(App) {
  /** Once, at dialog setup: the anchors the fold rows return to, every delegated click. */
  App.prototype._nsSetup = function () {
    const dlg = $('dialog-new-session');
    if (!dlg || this._nsWired) return;
    this._nsWired = true;
    this._ns = { taskIds: [], ticks: {}, tools: {}, adapters: null, grains: {}, excepts: {}, open: {}, harness: null, isGit: false, gitFor: '', cwd: null, folder: null };
    for (const k of FOLD_ROWS) { const row = $(FOLD_IDS[k]); if (row && !row.__nsHome) { const a = document.createComment('ns-home:' + k); row.before(a); row.__nsHome = a; } }
    $('ns-more-toggle')?.addEventListener('click', () => {
      const b = $('ns-more-toggle'); const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      try { localStorage.setItem(FOLD_KEY, open ? '1' : '0'); } catch { /* a private window keeps it for the open */ }
    });
    const kindIc = { chat: 'robot', terminal: 'terminal' };
    for (const b of document.querySelectorAll('#ns-kind-seg button[data-kind]')) { const s = b.querySelector('.ns-kind-ic'); if (s && !s.firstChild) s.innerHTML = ic(kindIc[b.dataset.kind]); }
    $('ns-kind-seg')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-kind]'); if (!b || b.disabled) return;
      this._nsKind(b.dataset.kind);
    });
    $('ns-be-phone')?.addEventListener('change', (e) => {   // the phone's backend: a native select over the same backing value
      const sel = $('input-backend'); if (!sel || sel.value === e.target.value) return;
      sel.value = e.target.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    $('input-tui')?.addEventListener('change', () => this._nsRender());   // → #input-mode (the backing value Create reads)
    $('row-task-groups')?.addEventListener('click', (e) => this._nsGroupsClick(e));
    try { window.matchMedia?.('(max-width: 768px)').addEventListener('change', () => { if (!$('dialog-new-session')?.classList.contains('hidden')) this._nsRender(); }); } catch { /* an old engine: the next open draws for the width */ }
    $('ns-be-seg')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-backend]'); if (!b) return;
      const sel = $('input-backend'); if (!sel || sel.value === b.dataset.backend) return;
      sel.value = b.dataset.backend;
      sel.dispatchEvent(new Event('change', { bubbles: true }));   // the ONE road: applyBackend (wired at setup)
    });
    $('input-session-name')?.addEventListener('input', () => { try { this._cwdField?.refresh(); } catch { } });
    // the folder's origin: typing makes it the person's; leaving it EMPTY lets the groups fill it again (never under the caret)
    $('input-cwd')?.addEventListener('input', (e) => { this._ns.folder = folderOnEdit(this._ns.folder, e.target.value); });
    const pfEl = this._cwdField?.el;
    pfEl?.addEventListener('focusout', () => setTimeout(() => {
      if (pfEl.contains(document.activeElement) || document.querySelector('.pf-picker')) return;   // its own list / picker is not leaving
      this._nsFolderTo(folderOnLeave(this._ns.folder, this._nsGroupFolders(), $('input-host')?.value || ''));
    }, 200));
    for (const id of ['input-model', 'input-effort', 'input-permission', 'input-account', 'input-extra-args', 'input-worktree', 'input-host', 'input-model-custom']) {
      $(id)?.addEventListener('change', () => this._nsRender());
    }
    $('input-extra-args')?.addEventListener('input', () => this._nsPaintFoot());
    $('row-tools')?.addEventListener('click', (e) => this._nsToolsClick(e));
    $('ns-foot-info')?.addEventListener('click', (e) => { const c = e.target.closest('[data-chip]'); if (c) this._nsReveal(c.dataset.chip); });
    $('ns-right')?.addEventListener('click', (e) => this._nsRightClick(e));
    $('ns-right')?.addEventListener('change', (e) => {
      const x = e.target.closest('input[data-acc]');
      if (x) { this._ns.ticks[x.dataset.acc] = !!x.checked; if (!x.checked) delete this._ns.ticks[x.dataset.acc]; this._nsPaintRight(); }
    });
  };

  /** Every open (showNewSessionDialog): the picked groups, no ticks, the harness's own tool defaults, fresh stores. */
  App.prototype._nsOpen = function ({ taskIds = [] } = {}) {
    this._nsSetup();
    const known = new Set((this.sidebar?._tasks || []).map((g) => g.id));
    this._ns = { ...this._ns, taskIds: (Array.isArray(taskIds) ? taskIds : []).filter((id) => known.has(id)), ticks: {}, tools: {}, adapters: null, grains: {}, excepts: {}, open: {}, harness: null, isGit: false, gitFor: '', cwd: null, folder: null };
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
    this._ns.taskIds = ids;
    this._nsFolderFollow(); // a folder the groups gave follows them (add / remove / reorder); one the person chose stays
    try { window.__vsOp?.('ns-groups', { n: ids.length, why }); } catch { }
    this._fillBrowserProfileRow?.(ids);
    try { this._cwdField?.refresh(); } catch { }
    this._nsRender();
  };

  // ── 工作目录 ← 任务组 (lane new-session-group-folder-link — the owner: 「选了一个任务组会自动填充一个 path，但此时我删掉重新
  //    选择其他任务组，这个 path 不会改变」). The decisions are PURE (new-session-model.js folderOn*); this only shows them.
  /** The picked groups as the folder model takes them ({ id, folders }, in the order picked). */
  App.prototype._nsGroupFolders = function () {
    return this._nsGroups().map((g) => ({ id: g.id, folders: this.sidebar?._folderPaths?.(g) || [] }));
  };
  /** The folder model moves to `next`; a folder that follows is SHOWN — setDerived, the line naming the group it came from. */
  App.prototype._nsFolderTo = function (next) {
    if (!this._ns) return;
    const prev = this._ns.folder || null;
    this._ns.folder = next;
    const text = folderShows(prev, next);
    if (text == null) return;
    const g = next.from ? this.sidebar?._taskById?.(next.from) : null;
    const note = g ? t('(from Task Group «{name}»)', { name: groupName(g) }) : '';
    if (this._cwdField?.setDerived) this._cwdField.setDerived(text, { note });
    else { const i = $('input-cwd'); if (i) i.value = text; }
  };
  /** Every open: the caller's folder — a group's (derived) or another place (kept) — else what the picked groups give. */
  App.prototype._nsFolderOpen = function (cwd) {
    if (!this._ns) return;
    const next = folderOnOpen({ cwd, groups: this._nsGroupFolders(), host: $('input-host')?.value || '' });
    this._ns.folder = null;
    if (next.origin !== 'prefill-cwd') { this._nsFolderTo(next); return; }
    this._ns.folder = next;
    const i = $('input-cwd'); if (i) i.value = next.value;
    this._cwdField?.set(next.value, { commit: false });
  };
  /** The picked groups or the machine changed: re-derive a folder that follows. */
  App.prototype._nsFolderFollow = function () {
    if (this._ns) this._nsFolderTo(folderOnGroups(this._ns.folder, this._nsGroupFolders(), $('input-host')?.value || ''));
  };
  /** The field committed (path-field onCommit): a pick / a chip / the picker / Enter on their text is the person's. */
  App.prototype._nsFolderCommitted = function (info) {
    if (this._ns) this._ns.folder = folderOnCommit(this._ns.folder, info);
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
    const chip = $('ns-be-chip'); if (chip) chip.textContent = shell ? '' : be;   // a login shell runs no harness: no chip
    const hostSel = $('input-host');
    const hostName = hostSel && hostSel.value ? (hostSel.selectedOptions[0]?.textContent || hostSel.value).replace(/\s*\(.*$/, '') : t('This machine');
    const dot = document.querySelector('#ns-host-dot .ns-host-name'); if (dot) dot.textContent = hostName;
    // the backend switch: the HARNESSES the select offers (a harness not installed is a hidden option — not offered; the
    // plain shell is the header's 终端, never a backend chip — one choice, one place); the phone's native select mirrors it
    const seg = $('ns-be-seg'); const sel = $('input-backend'); const ph = $('ns-be-phone');
    if (seg && sel) {
      const opts = [...sel.options].filter((o) => !o.hidden && !terminalOnly(o.value));
      const sig = opts.map((o) => o.value + ':' + o.textContent).join('|');
      if (seg.dataset.sig !== sig) { seg.dataset.sig = sig; seg.innerHTML = opts.map((o) => `<button type="button" data-backend="${escHtml(o.value)}">${escHtml(o.textContent)}</button>`).join(''); }
      for (const b of seg.querySelectorAll('button')) { const on = b.dataset.backend === sel.value; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
      if (ph) { if (ph.dataset.sig !== sig) { ph.dataset.sig = sig; ph.innerHTML = opts.map((o) => `<option value="${escHtml(o.value)}">${escHtml(o.textContent)}</option>`).join(''); } if (!shell) ph.value = sel.value; }
      if (!shell) this._ns.harness = sel.value;   // the way back from 终端
    }
    // THE ONE MODE DOOR: Agent (a harness) | Terminal (a login shell); the harness's own terminal UI is the fold's tick
    const mode = $('input-mode');
    if (mode) mode.value = shell || $('input-tui')?.checked ? 'terminal' : 'chat';
    for (const b of document.querySelectorAll('#ns-kind-seg button')) {
      const on = (b.dataset.kind === 'terminal') === shell;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    }
    const sub = $('ns-left-sub');
    if (sub) sub.textContent = shell ? t('Prefilled from last time · a login shell, no harness') : t('Prefilled from last time · the harness’s own flags go on its command line');
    $('ns-card-backend')?.classList.toggle('hidden', shell); $('ns-card-backend-h')?.classList.toggle('hidden', shell);   // 终端: the card is not drawn
    $('row-model')?.closest('.ns-pair')?.classList.toggle('hidden', shell);
    this._nsPaintGroups();
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
    if (!shell) present.push('args', 'tui');   // the harness's own terminal UI: Agent mode only (a login shell IS a terminal)
    if (!shell && worktreeCapsFor(be).supported) present.push('worktree');
    return present;
  };
  App.prototype._nsWhy = function () {
    const acctSel = $('input-account');
    const nAcc = acctSel ? Math.max(0, [...acctSel.options].length - 2) : 0;   // Default + the machine login, then one per account
    const why = unfoldReasons({ sessions: this.sidebar?._allSessions || [], hosts: this._nsHosts || [], accounts: nAcc, isGit: !!this._ns.isGit, tuiDefault: this.settings?.get?.('session.defaultMode') === 'terminal' });
    if ($('input-host')?.value && !why.host) why.host = $('input-host').selectedOptions[0]?.textContent || $('input-host').value;   // opened ON a machine
    if ($('input-worktree')?.checked) why.worktree = why.worktree || true;
    if ($('input-tui')?.checked) why.tui = why.tui || 'ticked';   // a ticked row never hides its value
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
    if (k === 'tui' && why.tui === true) return t('Opened by itself: {why}', { why: t('your sessions start in the terminal by default (Settings)') });
    return '';
  };
  /** A footer chip's press: its row, unfolded when it is folded, scrolled to, its control focused. */
  App.prototype._nsReveal = function (k) {
    const ids = { backend: narrow() ? 'ns-be-phone' : 'ns-be-seg', model: 'input-model', effort: 'input-effort', permission: 'input-permission', tools: 'row-tools', kind: 'ns-kind-seg', host: 'input-host', account: 'input-account', args: 'input-extra-args', worktree: 'input-worktree', tui: 'input-tui', cwd: 'input-cwd' };
    const target = k === 'groups' ? document.querySelector('#row-task-groups [data-tg-add]') : (terminalOnly($('input-backend')?.value || 'claude') && k === 'backend' ? $('ns-kind-seg') : $(ids[k]));
    if (!target) return;
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
      permission: $('input-permission')?.value || '', tools: shell ? '' : toolChipText(row, this._nsToolPick()), tui: !shell && !!$('input-tui')?.checked,
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
    const grains = {}, excepts = {};
    await Promise.all(adapters.map(async (a) => {
      const v = await fetchJson(`/api/channels/adapters/${encodeURIComponent(a.id)}/view`);
      const g = v && v.adapter && v.adapter.accountGrain;
      grains[a.id] = g && Array.isArray(g.access) ? g.access : [];
      excepts[a.id] = g && Array.isArray(g.except) ? g.except : [];   // lane grants-unify's 「除了」: the members its group / everyone rows leave out
    }));
    if (seq !== this._nsAccSeq || !this._ns) return;
    this._ns.adapters = adapters; this._ns.grains = grains; this._ns.excepts = excepts;
    this._nsPaintRight();
  };
  /** The header's Agent | Terminal — THE one mode door (one choice, one place). Terminal = a login shell with no harness:
   *  the backing select takes its shell option through applyBackend (the ONE road); the harness picked so far is kept for
   *  the way back. The harness's own terminal UI is NOT this switch — it is the fold's tick (#input-tui). */
  App.prototype._nsKind = function (kind) {
    const sel = $('input-backend'); if (!sel || !this._ns) return;
    const shellNow = terminalOnly(sel.value || 'claude');
    const harness = (v) => !!v && [...sel.options].some((o) => o.value === v && !o.hidden && !terminalOnly(o.value));
    let to = null;
    if (kind === 'terminal' && !shellNow) to = [...sel.options].find((o) => terminalOnly(o.value))?.value || null;
    else if (kind !== 'terminal' && shellNow) to = harness(this._ns.harness) ? this._ns.harness : ([...sel.options].find((o) => harness(o.value))?.value || null);
    if (!to || to === sel.value) return;
    sel.value = to;
    sel.dispatchEvent(new Event('change', { bubbles: true }));   // the ONE road: applyBackend (wired at setup)
    try { window.__vsOp?.('ns-kind', { kind }); } catch { }
  };

  // ── LEFT: 任务组 — under the name, above the folder (the folder's candidates are computed from it) ─────────────
  /** A session's membership is a first-class field beside its name: the chips in the order picked (= taskIds), KEYED by
   *  the group's id and patched in place; the sentence under them says what membership brings (none picked = a plain grey
   *  sentence, never a warning). No Task Group exists at all ⇒ no row (nothing to pick). */
  App.prototype._nsPaintGroups = function () {
    const row = $('row-task-groups'); if (!row || !this._ns) return;
    const all = this.sidebar?._taskBoardOrder?.() || [];
    row.classList.toggle('hidden', !all.length);
    if (!row.querySelector('.ns-tg-box')) {
      row.innerHTML = `<span class="ns-lab"><span class="ns-tg-lab"></span><span class="ns-lab-hint ns-tg-hint"></span></span><div class="ns-tg-box" id="ns-tg-box" role="group"><button type="button" class="ns-tg-add" data-tg-add></button></div><div class="ns-tg-reason" aria-live="polite"></div>`;
    }
    row.querySelector('.ns-tg-lab').textContent = t('Task Groups');
    row.querySelector('.ns-tg-hint').textContent = t('several allowed · decides where it is listed, what context it gets, who can see it');
    const box = row.querySelector('.ns-tg-box'); const add = box.querySelector('[data-tg-add]');
    box.setAttribute('aria-label', t('Task Groups (several allowed)'));
    const groups = this._nsGroups();
    const want = new Set(groups.map((g) => g.id));
    for (const c of [...box.querySelectorAll('.ns-tg-chip')]) if (!want.has(c.dataset.tgChip)) c.remove();
    groups.forEach((g, i) => {
      let c = [...box.querySelectorAll('.ns-tg-chip')].find((x) => x.dataset.tgChip === g.id);
      if (!c) {
        c = document.createElement('span'); c.className = 'ns-tg-chip'; c.dataset.tgChip = g.id;
        c.innerHTML = '<span class="ns-tg-n"></span><span class="tvg-dot"></span><span class="ns-tg-name"></span><button type="button" class="ns-tg-x">×</button>';
      }
      const color = this.sidebar?.getTaskColor?.(g) || g.color || '';
      c.style.setProperty('--g-color', color);
      c.querySelector('.tvg-dot').style.setProperty('--g-color', color);
      c.title = groupName(g) + ' · ' + g.id;
      c.querySelector('.ns-tg-n').textContent = String(i + 1);
      c.querySelector('.ns-tg-name').textContent = groupName(g);
      const x = c.querySelector('.ns-tg-x'); x.dataset.tgX = g.id; x.setAttribute('aria-label', t('Remove “{name}”', { name: groupName(g) }));
      if (box.children[i] !== c) box.insertBefore(c, box.children[i] || add);
    });
    add.textContent = groups.length ? '+' : t('+ Pick Task Groups');
    add.setAttribute('aria-label', t('+ Pick Task Groups'));
    const why = row.querySelector('.ns-tg-reason');
    why.classList.toggle('dim', !groups.length);
    why.textContent = !groups.length ? t('No Task Group: listed only under «Sessions», with its own folder and context')
      : groups.length === 1 ? t('It will be listed in this group and get its context; the folder below is suggested from its folders ↓')
        : t('It will be listed in these {n} groups and get their context; the folder below is suggested from their folders ↓', { n: groups.length });
  };
  App.prototype._nsGroupsClick = function (e) {
    const x = e.target.closest('[data-tg-x]');
    if (x) { e.preventDefault(); this._nsSetGroups(this._nsTaskIds().filter((id) => id !== x.dataset.tgX), { why: 'remove' }); return; }
    const add = e.target.closest('[data-tg-add]');
    if (add) { e.preventDefault(); this._nsGroupMenu(add); }
  };

  App.prototype._nsRightClick = function (e) {
    const tog = e.target.closest('[data-res-tog]');
    if (tog) { const k = tog.dataset.resTog; this._ns.open[k] = !this._ns.open[k]; this._nsPaintRight(); return; }
    if (e.target.closest('[data-goto-groups]')) { this._nsReveal('groups'); return; }
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
  /** The 任务组 picker: every group, a tick and its order for the picked ones; a press picks / unpicks. A popover at the
   *  «+» on the desktop; on the phone a BOTTOM SHEET (full-width 50 px rows under the thumb, ✓, 完成). */
  App.prototype._nsGroupMenu = function (anchor) {
    document.querySelectorAll('.ns-tg-menu, .ns-tg-scrim').forEach((m) => m.remove());
    const sheet = narrow();
    const menu = document.createElement('div');
    menu.className = 'ns-tg-menu' + (sheet ? ' ns-tg-sheet' : ''); menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-multiselectable', 'true'); menu.setAttribute('data-popover', '');
    menu.setAttribute('aria-label', t('Task Groups'));
    const all = this.sidebar?._allSessions || [];
    const members = (g) => { try { return this.sidebar?._getTaskSessionKeys?.(g, all)?.size || 0; } catch { return 0; } };
    let scrim = null;
    const off = (e) => { if (!menu.contains(e.target) && e.target !== anchor && e.target !== scrim) close(); };
    const close = () => { menu.remove(); scrim?.remove(); document.removeEventListener('pointerdown', off, true); };
    const draw = () => {
      const picked = this._nsTaskIds();
      const items = (this.sidebar?._taskBoardOrder?.() || []).filter((g) => !g.archived || picked.includes(g.id)).map((g) => {
        const i = picked.indexOf(g.id);
        const folder = (this.sidebar?._folderPaths?.(g) || [])[0] || '';
        const small = sheet ? `<small>${escHtml([folder, t('{n} session(s)', { n: members(g) })].filter(Boolean).join(' · '))}</small>` : '';
        return `<button type="button" class="ns-tg-item${i >= 0 ? ' on' : ''}" role="option" aria-selected="${i >= 0}" data-tg="${escHtml(g.id)}"><span class="ns-tg-ord">${i >= 0 ? i + 1 : ''}</span><span class="tvg-dot" style="--g-color:${escHtml(this.sidebar?.getTaskColor?.(g) || g.color || '')}"></span><span class="ns-tg-it"><span>${escHtml(groupName(g))}</span>${small}</span>${sheet ? `<span class="ns-tg-tick" aria-hidden="true">${i >= 0 ? '✓' : ''}</span>` : ''}</button>`;
      }).join('') || `<div class="ns-pv-via dim">${escHtml(t('No Task Groups yet'))}</div>`;
      menu.innerHTML = (sheet ? `<div class="ns-sheet-h"><span><b>${escHtml(t('Task Groups'))}</b> · ${escHtml(t('several, in the order tapped'))}</span><button type="button" data-tg-done>${escHtml(tc('sheet', 'Done'))}</button></div>` : '') + items;
    };
    draw();
    menu.addEventListener('click', (e) => {
      if (e.target.closest('[data-tg-done]')) { close(); return; }
      const b = e.target.closest('[data-tg]'); if (!b) return;
      this._nsSetGroups(toggleGroup(this._nsTaskIds(), b.dataset.tg), { why: 'pick' }); draw();
    });
    if (sheet) {
      scrim = document.createElement('div'); scrim.className = 'ns-tg-scrim';
      scrim.addEventListener('click', close);
      document.body.append(scrim, menu);
    } else {
      document.body.appendChild(menu);
      const r = anchor.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
      menu.style.top = (r.bottom + 4 + menu.offsetHeight > innerHeight ? Math.max(8, r.top - menu.offsetHeight - 4) : r.bottom + 4) + 'px';
    }
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  };

  // ── RIGHT: 能用什么 — what the session may use, READ from the left; cards on the desktop, an accordion on the phone ──
  /** A granted row's 「除了」 member, by name (a conversation: the sidebar's own name ladder; a group: its title). */
  App.prototype._nsExceptName = function (p) {
    if (p.kind === 'group') { const g = this.sidebar?._taskById?.(p.id); return g ? groupName(g) : t('a deleted Task Group'); }
    const k = String(p.key || p.id || ''); const bare = k.slice(k.indexOf(':') + 1);   // a conversation key: '<backend>:<id>' (or the bare id)
    const s = (this.sidebar?._allSessions || []).find((x) => x.backendSessionId === bare || x.sessionId === bare);
    return (s && sessionDisplayName(s)) || (p.name ? String(p.name) : t('a conversation not live now'));
  };
  App.prototype._nsPaintRight = function () {
    const box = $('ns-right'); if (!box || !this._ns) return;
    const be = $('input-backend')?.value || 'claude';
    const shell = terminalOnly(be);
    const phone = narrow();
    const bprof = $('row-browser-profile');
    if (bprof) bprof.remove();   // kept across the redraw (its select is what Create reads)
    const on = `<span class="ns-on">${escHtml(t('On'))}</span>`;
    const doorBtn = (door, label, extra = '') => `<button type="button" class="ns-link" data-door="${door}" ${extra}>${escHtml(label)} ›</button>`;
    // one resource = { key, cls, icon, name, what, end (the desktop's door / mark), sub (its rows), sum + badge (the phone's line), body (the phone's rows) }
    const prov = (r) => `<div class="ns-prov${r.cls ? ' ' + r.cls : ''}" ${r.data || ''}><span class="ns-pv-tick">${r.icon}</span><span class="ns-pv-name">${escHtml(r.name)}</span><span class="ns-pv-what">${escHtml(r.what || '')}</span><span class="ns-pv-end">${r.end || ''}</span>${r.sub ? `<div class="ns-pv-sub">${r.sub}</div>` : ''}</div>`;
    const acc = (r) => { const open = !!this._ns.open[r.key]; return `<div class="ns-res${open ? ' open' : ''}${r.cls ? ' ' + r.cls : ''}" ${r.data || ''}><button type="button" class="ns-res-h" data-res-tog="${r.key}" aria-expanded="${open}"><span class="ns-res-ic">${r.icon}</span><span class="ns-res-t"><b>${escHtml(r.name)}</b><small>${escHtml(r.sum || '')}</small></span>${r.badge || '<span></span>'}<span class="ns-res-chev" aria-hidden="true">›</span></button><div class="ns-res-body">${r.body != null ? r.body : r.sub || ''}</div></div>`; };
    const head = `<div class="ns-col-h"><b>${escHtml(t('What it may use'))}</b><span>${escHtml(t('VibeSpace’s own records — grants by resource; what its Task Groups grant is already ticked'))}</span></div>`;
    // 会话 — READS the left column's 任务组 row (no picker here)
    const groups = this._nsGroups();
    const all = this.sidebar?._allSessions || [];
    const reach = groupReach(groups.map((g) => { try { return { keys: [...(this.sidebar?._getTaskSessionKeys?.(g, all) || [])] }; } catch { return { keys: [] }; } }));
    const names = quoted(groups.map(groupName));
    const reachWords = groups.length === 1 ? t('Joined {names} — can see and message the {n} session(s) in this group; groups it did not join only reach the sessions it starts itself', { names, n: reach.sessions })
      : groups.length ? t('Joined {names} — can see and message the {n} session(s) in these {g} groups; groups it did not join only reach the sessions it starts itself', { names, n: reach.sessions, g: reach.groups })
        : t('No Task Group — it only reaches the sessions it starts itself');
    const goto = $('row-task-groups')?.classList.contains('hidden') ? '' : ` <button type="button" class="ns-link" data-goto-groups>${escHtml(groups.length ? t('Change on the left') : t('Pick Task Groups on the left'))} ↖</button>`;
    const sessions = { key: 'sessions', cls: 'locked', data: 'data-row="sessions"', icon: ic('lock'), name: t('Sessions'), what: t('Read, message, start new ones'), end: on, badge: on,
      sub: `<div class="ns-pv-via${groups.length ? '' : ' dim'}" data-reach>${escHtml(reachWords)}${goto}</div>`,
      sum: groups.length ? t('Joined {names} · {n} session(s)', { names, n: reach.sessions }) : t('No Task Group — only the sessions it starts') };
    if (shell) {   // 终端: no agent — 「会话」 + one sentence (the design's C-terminal board)
      const plain = `<div class="ns-plain">${escHtml(t('A Terminal has no agent: channels, browser profiles and the vault need an agent, so they are not listed. In this shell you sign in and open browsers yourself.'))}</div>`;
      box.innerHTML = head + (phone ? `<div class="ns-res-list">${acc(sessions)}</div>` : `<div class="ns-card-h">VibeSpace</div><div class="ns-card" data-card="vibespace">${prov(sessions)}</div>`) + plain;
      if (bprof) { const hold = document.createElement('div'); hold.hidden = true; hold.appendChild(bprof); box.appendChild(hold); }
      return;
    }
    // built in
    const BUILTIN = [['artifacts', t('Artifacts it makes'), t('The files it writes, shown in this conversation’s Artifacts')], ['feedback', t('Feedback'), t('Tells the maintainers where a tool felt wrong (vibespace-feedback)')], ['pages', t('Page publishing'), t('Publishes a page on this VibeSpace (vibespace pages)')]];
    const builtinRows = BUILTIN.map(([k, n, w]) => prov({ cls: 'locked', data: `data-builtin="${k}"`, icon: ic('lock'), name: n, what: w, end: on })).join('');
    // 频道 — one tick per account (the same assignment record the Channels window writes); a group grant ticked + locked, its 除了
    const rows = accountRows(this._ns.adapters || [], this._ns.grains || {}, this._nsTaskIds(), this._ns.excepts || {});
    const AUTH = (a) => (a === 'send' ? t('can send') : t('draft only'));
    const accRows = rows.map((r) => {
      const kind = `<span class="ns-chan-k">${escHtml(r.vendor || r.kind)}</span>`;
      if (r.granted) {
        const via = r.everyone ? t('All agents · {authority}', { authority: AUTH(r.authority) }) : t('Through Task Group {names} · {authority}', { names: quoted(r.groups.map((id) => groupName(this.sidebar?._taskById?.(id) || { id }))), authority: AUTH(r.authority) });
        const exc = r.except.map((p) => `<span class="ns-exc">${escHtml(t('Except: '))}<b>${escHtml(this._nsExceptName(p))}</b></span>`).join('');
        return `<div class="ns-acc granted" data-acc-row="${escHtml(r.id)}"><input type="checkbox" checked disabled aria-label="${escHtml(t('“{name}” comes through its Task Group', { name: r.label }))}"><span class="ns-acc-n">${kind}${escHtml(r.label)}</span><span class="ns-pv-via">${escHtml(via)}${exc}</span><span class="ns-acc-end">${doorBtn('chan', t('Except…'), `data-acc="${escHtml(r.id)}" title="${escHtml(t('Who is left out is set where the account is shared — the Channels window'))}"`)}</span></div>`;
      }
      const ticked = !!this._ns.ticks[r.id];
      return `<label class="ns-acc${ticked ? ' on' : ''}" data-acc-row="${escHtml(r.id)}"><input type="checkbox" data-acc="${escHtml(r.id)}" ${ticked ? 'checked' : ''} aria-label="${escHtml(t('Let this conversation see “{name}”', { name: r.label }))}"><span class="ns-acc-n">${kind}${escHtml(r.label)}</span><span class="ns-pv-via${ticked ? ' ok' : ' dim'}">${escHtml(ticked ? t('Written into the channel assignment at create: this conversation · draft only') : t('Not assigned to the picked Task Groups — tick to give this conversation (draft only)'))}</span></label>`;
    }).join('') || `<div class="ns-pv-via dim" data-fact="noacc">${escHtml(this._ns.adapters ? t('No account connected yet') : t('Reading the accounts…'))}${this._ns.adapters ? ' ' + doorBtn('integrations', t('Integrations')) : ''}</div>`;
    const sm = resourceSummary({ rows, ticks: this._ns.ticks });
    const chanSum = [t('{n} account(s) through Task Groups', { n: sm.granted }), sm.ticked ? t('{n} ticked here', { n: sm.ticked }) : '', sm.todo ? t('{n} more to tick', { n: sm.todo }) : ''].filter(Boolean).join(' · ');
    const chan = { key: 'chan', data: 'data-row="chan"', icon: ic('chat'), name: t('Channels'), what: t('Inbox: read, search, draft — one tick per account'), end: doorBtn('chan', t('Channels window')),
      sub: accRows, body: accRows + `<div class="ns-res-door">${doorBtn('chan', t('Channels window'))}</div>`, sum: this._ns.adapters ? chanSum : t('Reading the accounts…'),
      badge: sm.todo ? `<span class="ns-badge todo">${escHtml(t('{n} to tick', { n: sm.todo }))}</span>` : '' };
    // 浏览器 — only the profiles the picked groups admit
    const hostSel = $('input-host');
    let browser = null;
    if (hostSel && hostSel.value) {
      const words = t('Sessions on {host} cannot use this machine’s browser profiles', { host: (hostSel.selectedOptions[0]?.textContent || hostSel.value).replace(/\s*\(.*$/, '') });
      browser = { key: 'browser', cls: 'fact', data: 'data-fact="bprof"', icon: ic('globe'), name: t('Browser'), what: words, sum: words };
    } else if (bprof && bprof.style.display !== 'none') {
      const hidden = Number(bprof.dataset.hiddenCount || 0);
      const pick = bprof.querySelector('select');
      const chosen = pick && pick.value ? (pick.selectedOptions[0]?.textContent || '').replace(/\s+—.*$/, '') : '';
      const sub = `<div class="ns-pv-subrow"><span class="ns-pv-subk">${escHtml(t('Profile'))}</span><span data-slot="bprof"></span></div><div class="ns-pv-via dim">${escHtml(t('Only the profiles open to this conversation (or its Task Groups) are listed'))}${hidden ? escHtml(t(' · {n} more are not open to it', { n: hidden })) : ''}</div>`;
      browser = { key: 'browser', data: 'data-row="bprof"', icon: ic('globe'), name: t('Browser'), what: t('Opens a browser with a profile'), sub, sum: chosen ? t('Profile {name}', { name: quoted([chosen]) }) : t('No profile (temporary browser)') };
    }
    const vault = { key: 'vault', cls: 'fact', data: 'data-fact="vault"', icon: ic('lock'), name: t('Vault'), what: t('2FA codes and security keys (passkeys) — by purpose: the agent gets the purpose, never the value'), end: doorBtn('vault', t('Vault')) };
    vault.sum = t('By purpose — the agent gets the purpose, never the value'); vault.body = `<div class="ns-pv-via dim">${escHtml(vault.what)}</div><div class="ns-res-door">${vault.end}</div>`;
    const keys = { key: 'keys', cls: 'fact', data: 'data-fact="keys"', icon: ic('info'), name: t('Automation keys'), what: t('Who may use which key is set in the Automation keys window'), end: doorBtn('keys', t('Automation keys')) };
    keys.sum = keys.what; keys.body = `<div class="ns-res-door">${keys.end}</div>`;
    const foot = `<div class="ns-reach-foot">${ic('info')} <span>${escHtml(t('A new conversation gets only what its Task Groups already grant; what you tick here is written into the same permission record'))}</span></div>`;
    const res = [sessions, chan, browser, vault, keys].filter(Boolean);
    if (phone) {
      const builtin = { key: 'builtin', cls: 'locked', icon: ic('lock'), name: t('{n} built-ins', { n: BUILTIN.length }), sum: t('Artifacts · Feedback · Page publishing — always on'), badge: on, body: `<div class="ns-card ns-builtin">${builtinRows}</div>` };
      box.innerHTML = head + `<div class="ns-res-list" data-card="vibespace">${[builtin, ...res].map(acc).join('')}</div>` + foot;
    } else {
      box.innerHTML = head + `<div class="ns-card-h"><i class="ns-dot"></i>${escHtml(t('Built in · always on'))}</div><div class="ns-card ns-builtin">${builtinRows}</div>`
        + `<div class="ns-card-h">VibeSpace</div><div class="ns-card" data-card="vibespace">${res.map(prov).join('')}</div>` + foot;
    }
    const slot = box.querySelector('[data-slot="bprof"]');
    if (bprof) { if (slot) slot.appendChild(bprof); else { const hold = document.createElement('div'); hold.hidden = true; hold.appendChild(bprof); box.appendChild(hold); } }
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
