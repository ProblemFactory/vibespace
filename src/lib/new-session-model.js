// PURE (imports nothing; DOM-free, suite-tested) — THE NEW SESSION FORM'S FACTS (lane new-session-form; the POC v2.2
// two columns, SharedContext/vibespace-new-session-field-census.md for the folding). src/lib/new-session-form.js draws
// what these answer; nothing here reads the page.
//   FOLD_ROWS / unfoldReasons(facts) / foldPlan({present, why}) — the rows the fleet census found rare (machine,
//       account, extra arguments, git worktree) fold under 「更多选项」 unless the person's own data says they matter:
//       a paired machine used in the last 30 days, two accounts or more for this harness, a git folder. (The mode row
//       is the header's Agent | Terminal switch now — always shown, so "terminal used lately" unfolds nothing.)
//   footerChips(facts) — the run's values as footer chips (each names the row it opens; a folded row's chip is dashed)
//   createRefusal(facts) — why Create cannot run yet, as a key the form words (null = it can)
//   toolStates / toolCycle / toolPickOf / codexPreset — the 「可用工具」 row over the harness's own toolAllowlist row
//   accountRows(adapters, grains, taskIds) — 「账号 · 以你的身份」: the channel accounts, ONE list, with what the picked
//       Task Groups already grant (a group or everyone row ⇒ granted, locked); the rest are the ticks a create writes
//   tickState / bulkTick — the 无 | 已选 | 全部 switch over those ticks
//   toggleGroup(list, id) — the 任务组 chips' selection, kept in the order picked
export const FOLD_ROWS = Object.freeze(['host', 'account', 'args', 'worktree']);
export const RECENT_MS = 30 * 86400000;

/** Which folded rows unfold by themselves. `sessions` = the sidebar's rows ({host, mode, startedAt}), `hosts` = the paired
 *  machines ({id, name}), `accounts` = how many accounts this harness lists, `isGit` = the folder is a git repository. */
export function unfoldReasons({ sessions = [], hosts = [], accounts = 0, isGit = false, now = Date.now() } = {}) {
  const since = now - RECENT_MS;
  const recent = (Array.isArray(sessions) ? sessions : []).filter((s) => s && Number(s.startedAt) >= since);
  const byId = new Map((Array.isArray(hosts) ? hosts : []).filter((h) => h && h.id).map((h) => [String(h.id), h]));
  const used = recent.find((s) => s.host && byId.has(String(s.host)));
  return {
    host: used ? String(byId.get(String(used.host)).name || used.host) : '',
    account: Number(accounts) >= 2 ? Number(accounts) : 0,
    terminal: recent.some((s) => s.mode === 'terminal'),
    worktree: !!isGit,
    args: false,
  };
}
/** `present` = the fold rows this backend / machine offers at all; → which stand in their card and which fold. */
export function foldPlan({ present = [], why = {} } = {}) {
  const up = [], folded = [];
  for (const k of FOLD_ROWS) { if (!present.includes(k)) continue; (why[k] ? up : folded).push(k); }
  return { up, folded };
}

/** The footer's chips — `v` = the run's values, `folded` = the rows folded now. Every row the run depends on has one;
 *  a chip never hides a value (dashed when its row is folded). */
export function footerChips(v = {}, folded = []) {
  const f = new Set(folded);
  const out = [];
  const push = (row, text, extra = {}) => out.push({ row, text: String(text), folded: f.has(row), ...extra });
  push('backend', v.backendLabel || v.backend || '', { cls: 'be' });
  if (!v.shell) {
    push('model', v.model || 'Default model', { word: !v.model });
    if (v.effortRow) push('effort', v.effort || 'Auto effort', { word: !v.effort });
    push('permission', v.permission || 'Default permissions', { word: !v.permission });
    if (v.tools) push('tools', v.tools);
  }
  if (v.kind === 'terminal' && !v.shell) push('kind', 'Terminal', { word: true });
  if (v.hostRow) push('host', v.hostName || 'This machine', { word: !v.hostName });
  if (v.accountRow) push('account', v.account || 'Default account', { word: !v.account });
  if (v.argsRow && v.args) push('args', v.args);
  if (v.worktreeRow && v.worktree) push('worktree', 'git worktree', { word: true });
  return out;
}

/** WHY CREATE CANNOT RUN YET — the first reason, as a key the form words (the cwd field's own sentence first). */
export function createRefusal({ cwd = null, modelsNone = false, noAgent = false } = {}) {
  const st = cwd && cwd.status;
  if (st === 'empty') return { row: 'cwd', key: 'Choose a folder first' };
  if (st === 'unresolved' || st === 'searching' || st === 'pending') return { row: 'cwd', text: String(cwd.text || ''), key: cwd.text ? null : 'The working directory is not chosen yet' };
  if (modelsNone && !noAgent) return { row: 'model', key: 'This account’s provider has no models — set them up first' };
  return null;
}

// ── 可用工具 ──────────────────────────────────────────────────────────────────
/** The next state of one Claude tool chip: default → allow (✓) → deny (✗) → default; a `keep` tool never takes ✗. */
export function toolCycle(row, tool, cur) {
  const keep = !!(row && Array.isArray(row.keep) && row.keep.includes(tool));
  if (!cur) return 'allow';
  if (cur === 'allow') return keep ? '' : 'deny';
  return '';
}
/** The pick the create sends: claude `{allow, deny}` from the chip states, codex `{sandbox, approval}`; null = none. */
export function toolPickOf(row, states = {}) {
  if (!row) return null;
  if (row.kind === 'tools') {
    const allow = row.tools.filter((x) => states[x] === 'allow');
    const deny = row.tools.filter((x) => states[x] === 'deny' && !(row.keep || []).includes(x));
    return allow.length || deny.length ? { allow, deny } : null;
  }
  const out = {};
  if (states.sandbox && row.sandbox.includes(states.sandbox)) out.sandbox = states.sandbox;
  if (states.approval && row.approval.includes(states.approval)) out.approval = states.approval;
  return Object.keys(out).length ? out : null;
}
/** What codex's permission mode maps to — the mirror of src/adapters/codex.js resolveCodexPermissionMode (sandbox
 *  available), test-harness-contract compares the two for every mode the form offers. */
const CODEX_PRESETS = Object.freeze({
  'read-only': Object.freeze({ sandbox: 'read-only', approval: 'never' }),
  'safe-yolo': Object.freeze({ sandbox: 'workspace-write', approval: 'on-failure' }),
  yolo: Object.freeze({ sandbox: 'danger-full-access', approval: 'never' }),
});
const CODEX_DEFAULT = Object.freeze({ sandbox: 'workspace-write', approval: 'on-request' });
export function codexPreset(mode) { return CODEX_PRESETS[mode] || CODEX_DEFAULT; }
/** The short words a footer chip shows for a pick (`✓Read ✓Edit ✗WebFetch` / `read-only · never`). */
export function toolChipText(row, pick) {
  if (!row || !pick) return '';
  if (row.kind === 'tools') return [...(pick.allow || []).map((x) => '✓' + x), ...(pick.deny || []).map((x) => '✗' + x)].join(' ');
  return [pick.sandbox, pick.approval].filter(Boolean).join(' · ');
}

// ── 账号 · 以你的身份 ─────────────────────────────────────────────────────────
/** `adapters` = the channel accounts ({id, kind, label, vendor, builtin, enabled, listed, reach}), `grains` = id → its
 *  account grain's access rows, `taskIds` = the picked groups. A row a picked group (or everyone) holds is GRANTED —
 *  shown ticked and locked, with the strongest authority and the groups it comes through; the others are tickable. */
export function accountRows(adapters = [], grains = {}, taskIds = []) {
  const mine = new Set((Array.isArray(taskIds) ? taskIds : []).map(String));
  const out = [];
  for (const a of Array.isArray(adapters) ? adapters : []) {
    if (!a || !a.id || a.builtin || a.listed === false || (a.reach && a.reach !== 'grants')) continue;
    const access = Array.isArray(grains[a.id]) ? grains[a.id] : [];
    const via = access.filter((r) => r && r.principal && (r.principal.kind === 'everyone' || (r.principal.kind === 'group' && mine.has(String(r.principal.id)))));
    const authority = via.some((r) => (r.authorityStored || r.authority) === 'send') ? 'send' : via.length ? 'draft' : null;
    out.push({
      id: a.id, kind: a.kind || '', vendor: a.vendor || a.kind || '', label: a.label || a.id, enabled: a.enabled !== false,
      granted: via.length > 0, authority, everyone: via.some((r) => r.principal.kind === 'everyone'),
      groups: via.filter((r) => r.principal.kind === 'group').map((r) => String(r.principal.id)),
    });
  }
  return out;
}
/** The 无 | 已选 | 全部 switch's state over the tickable rows (`ticks` = id → bool). */
export function tickState(rows = [], ticks = {}) {
  const tickable = rows.filter((r) => !r.granted);
  const n = tickable.filter((r) => !!ticks[r.id]).length;
  if (!tickable.length || !n) return 'none';
  return n === tickable.length ? 'all' : 'some';
}
/** Press 无 / 全部 / 已选: the ticks after it. 已选 restores `remembered` (the last mixed selection), else keeps them. */
export function bulkTick(rows = [], ticks = {}, to = 'none', remembered = null) {
  const tickable = rows.filter((r) => !r.granted).map((r) => r.id);
  if (to === 'all') return Object.fromEntries(tickable.map((id) => [id, true]));
  if (to === 'none') return {};
  const back = remembered && typeof remembered === 'object' ? remembered : ticks;
  return Object.fromEntries(tickable.filter((id) => back[id]).map((id) => [id, true]));
}

// ── 任务组 ───────────────────────────────────────────────────────────────────
/** Pick / unpick one group; the list keeps the order the groups were picked in (taskIds rides in this order). */
export function toggleGroup(list = [], id) {
  const l = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!id) return l;
  return l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
}
/** The name field's empty placeholder: the chosen folder's own name (null = the field's default words). */
export function nameHint(path) {
  const p = String(path || '').trim().replace(/\/+$/, '');
  if (!p || p === '~') return null;
  const b = p.slice(p.lastIndexOf('/') + 1);
  return b || null;
}
