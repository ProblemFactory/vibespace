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
//   accountRows(adapters, grains, taskIds, excepts) — 「频道」's ticks (lane new-session-layout-v3-build: the separate
//       「账号 · 以你的身份」 card is merged into the 频道 row): the channel accounts, ONE list, with what the picked Task
//       Groups already grant (a group or everyone row ⇒ granted, locked, its 「除了」 drawn); the rest are the ticks a
//       create writes (one tick per account — the 无 | 已选 | 全部 switch is gone: one or two tickable accounts)
//   toggleGroup(list, id) — the 任务组 chips' selection, kept in the order picked
//   groupReach(groups) — the right column's 「会话」 sentence READS the left column's 任务组 row: how many groups, how many
//       sessions they hold (counted once)
//   resourceSummary(facts) — the phone's accordion line per resource (what is settled + what is left to decide)
//   createPlan(choices) — WHAT CREATE SENDS: the header's Agent | 终端 + the harness's own terminal UI tick → the road and
//       the payload (the v2 form's payload, meaning unchanged — scripts/test-new-session-form.mjs compares them)
//   groupFolder / folderOnOpen / folderOnGroups / folderOnEdit / folderOnCommit / folderOnLeave / folderShows — where the
//       folder came from (FOLDER_ORIGINS): a folder a Task Group gave FOLLOWS the groups until the person edits it
export const FOLD_ROWS = Object.freeze(['host', 'account', 'args', 'tui', 'worktree']);   // tui = 「用 harness 自己的终端界面跑」 (the owner's ① — Agent mode only)
export const RECENT_MS = 30 * 86400000;

/** Which folded rows unfold by themselves. `sessions` = the sidebar's rows ({host, mode, startedAt}), `hosts` = the paired
 *  machines ({id, name}), `accounts` = how many accounts this harness lists, `isGit` = the folder is a git repository. */
export function unfoldReasons({ sessions = [], hosts = [], accounts = 0, isGit = false, tuiDefault = false, now = Date.now() } = {}) {
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
    tui: !!tuiDefault,   // the person's own Settings default (session.defaultMode = terminal) ticks it — and shows it
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
  push('backend', v.shell ? 'Terminal · login shell' : (v.backendLabel || v.backend || ''), { cls: 'be', word: !!v.shell });
  if (!v.shell) {
    push('model', v.model || 'Default model', { word: !v.model });
    if (v.effortRow) push('effort', v.effort || 'Auto effort', { word: !v.effort });
    push('permission', v.permission || 'Default permissions', { word: !v.permission });
    if (v.tools) push('tools', v.tools);
  }
  if (v.tui && !v.shell) push('tui', 'Harness terminal UI', { word: true });   // the harness's own TUI in a terminal (the fold's tick)
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
  if (st === 'unresolved' || st === 'searching' || st === 'pending' || st === 'unreachable') return { row: 'cwd', text: String(cwd.text || ''), key: cwd.text ? null : 'The working directory is not chosen yet' };
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

// ── 频道 · one tick per account ────────────────────────────────────────────────
/** `adapters` = the channel accounts ({id, kind, label, vendor, builtin, enabled, listed, reach}), `grains` = id → its
 *  account grain's access rows, `taskIds` = the picked groups, `excepts` = id → the grain's 「除了」 (the members its
 *  group / everyone rows leave out — lane grants-unify). A row a picked group (or everyone) holds is GRANTED — shown
 *  ticked and locked, with the strongest authority, the groups it comes through and its 除了; the others are tickable. */
export function accountRows(adapters = [], grains = {}, taskIds = [], excepts = {}) {
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
      except: via.length && Array.isArray(excepts[a.id]) ? excepts[a.id].filter((p) => p && p.kind && (p.key || p.id)) : [],   // grant-model: { kind: 'conversation', key } | { kind: 'group', id }
    });
  }
  return out;
}

// ── 任务组 ───────────────────────────────────────────────────────────────────
/** Pick / unpick one group; the list keeps the order the groups were picked in (taskIds rides in this order). */
export function toggleGroup(list = [], id) {
  const l = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!id) return l;
  return l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
}
/** THE RIGHT COLUMN READS THE LEFT (lane new-session-layout-v3-build): `groups` = the picked groups' member keys
 *  ([{ keys }] in the order picked) → how many groups it joins and how many sessions it can see and message through
 *  them (a session in two picked groups counts once). */
export function groupReach(groups = []) {
  const all = new Set();
  const gs = Array.isArray(groups) ? groups.filter(Boolean) : [];
  for (const g of gs) for (const k of Array.isArray(g.keys) ? g.keys : []) if (k) all.add(String(k));
  return { groups: gs.length, sessions: all.size };
}
/** The phone's accordion line per resource: `rows` = accountRows, `ticks` = the person's ticks → how many accounts come
 *  through the picked groups, how many this conversation got ticked, how many are left to decide (`todo` ⇒ the row's
 *  yellow mark — something there still waits for the person). */
export function resourceSummary({ rows = [], ticks = {} } = {}) {
  const r = Array.isArray(rows) ? rows : [];
  const granted = r.filter((x) => x.granted).length;
  const ticked = r.filter((x) => !x.granted && ticks[x.id]).length;
  const todo = r.filter((x) => !x.granted && !ticks[x.id]).length;
  return { granted, ticked, todo };
}
/** WHAT CREATE SENDS. `v` = the controls' values as the page holds them; `noAgent` = the header's 终端 (a login shell, no
 *  harness — agent-meta terminalOnly(backend)). 终端 ⇒ { login: { cwd, hostId } } (openShellTerminal). Agent ⇒
 *  { payload } for createSession — mode 'terminal' when the harness runs in its OWN terminal UI (the fold's
 *  tick, ws-create's pty-wrapper road), else 'chat'. The payload's fields, their order and meaning are the v2 form's
 *  (c1dfc1af app.js) — the same choices give the same bytes (test-new-session-form ⑥). */
export function createPlan(v = {}) {
  const cwd = String(v.cwd || '').trim();
  const hostId = v.hostId || undefined;
  if (v.noAgent) return { login: { cwd: cwd || undefined, hostId } };   // a login shell: openShellTerminal(cwd, { hostId })
  const taskIds = Array.isArray(v.taskIds) ? v.taskIds : [];
  return {
    payload: {
      backend: v.backend || 'claude',
      hostId,
      mode: v.tui ? 'terminal' : 'chat',
      cwd,
      name: String(v.name || '').trim() || nameHint(cwd) || '',
      model: v.model === '__custom__' ? (String(v.modelCustom || '').trim() || '') : (v.model || ''),
      permission: v.permission || '',
      effort: v.effort || '',
      extraArgs: String(v.extraArgs || '').trim(),
      taskId: taskIds[0] || undefined,
      taskIds,
      tools: v.tools || undefined,
      accountId: v.accountId || undefined,
      browserProfileId: v.browserProfileId || undefined,
      browserProfileOrigin: v.browserProfileOrigin || undefined,
      worktree: !!v.worktreeSupported && !!v.worktree,
    },
  };
}
/** The name field's empty placeholder: the chosen folder's own name (null = the field's default words). */
export function nameHint(path) {
  const p = String(path || '').trim().replace(/\/+$/, '');
  if (!p || p === '~') return null;
  const b = p.slice(p.lastIndexOf('/') + 1);
  return b || null;
}

// ── 工作目录 ← 任务组 (lane new-session-group-folder-link) ─────────────────────────────────────────────────────────────
// The owner (2026-10-23): picking a group filled the folder ONCE, and that value then counted as typed — removing the
// group and picking another changed nothing. A DERIVED VALUE FOLLOWS ITS SOURCE UNTIL THE PERSON EDITS: the form keeps
// where its folder came from — { value, origin, from } — and every change of the picked groups re-derives a folder that
// still follows. The origins:
//   'empty'          nothing there; it follows the groups (the next group change, or leaving the field empty, fills it)
//   'derived-group'  the first picked group's first folder (`from` = that group's id); it follows the groups
//   'prefill-cwd'    the folder the dialog was opened on (a folder's «+», the palette, the Files row) — the person's place
//   'typed'          typed, or picked from the list / a chip / the picker — the person's; a group change never touches it
// (A 由名字 chip — <group folder>/<name> — is a pick: 'typed'. Nothing derives a folder from the name by itself.)
export const FOLDER_ORIGINS = Object.freeze(['empty', 'derived-group', 'prefill-cwd', 'typed']);
const FOLLOWS = new Set(['empty', 'derived-group']);
const NO_FOLDER = Object.freeze({ value: '', origin: 'empty', from: null });
const HOST_FOLDER = /^([^:/\s]+)::(\/.*)$/;   // a group folder declared for one machine (path-candidates HOST_ROW)
const trimFolder = (p) => { const s = String(p == null ? '' : p).trim(); return s.length > 1 ? s.replace(/\/+$/, '') : s; };

/** The folder the picked groups give: `groups` = [{ id, folders }] in the order picked → the first group's first folder on
 *  this machine (`host` '' = here; a `host::/path` folder counts on that machine only); a group without one passes the turn
 *  to the next. None ⇒ empty. */
export function groupFolder(groups = [], host = '') {
  for (const g of Array.isArray(groups) ? groups : []) {
    for (const f of g && Array.isArray(g.folders) ? g.folders : []) {
      const raw = typeof f === 'string' ? f : f && f.path;
      const m = raw ? HOST_FOLDER.exec(raw) : null;
      if (!raw || (m && m[1] !== String(host || ''))) continue;
      const value = trimFolder(m ? m[2] : raw);
      if (value) return { value, origin: 'derived-group', from: String(g.id) };
    }
  }
  return NO_FOLDER;
}
/** The dialog opens with the caller's `cwd`: opened from a group (its folder = what the groups give) ⇒ derived — it follows;
 *  opened on any other folder ⇒ the person's place, kept; no cwd ⇒ what the picked groups give. */
export function folderOnOpen({ cwd = '', groups = [], host = '' } = {}) {
  const d = groupFolder(groups, host);
  const c = trimFolder(cwd);
  if (!c) return d;
  return d.value && d.value === c ? d : { value: c, origin: 'prefill-cwd', from: null };
}
/** The picked groups changed (added / removed / reordered) or the machine did: a folder that follows re-derives; a folder
 *  the person chose stays exactly as it is (the groups then change only the candidates and the reach line). */
export function folderOnGroups(folder, groups = [], host = '') {
  return folder && !FOLLOWS.has(folder.origin) ? folder : groupFolder(groups, host);
}
/** The person typed into the field: the text is theirs. Emptied, the folder follows the groups again — refilled when they
 *  leave the field (folderOnLeave) or change a group, never under the caret. */
export function folderOnEdit(folder, text) {
  const v = String(text == null ? '' : text);
  return v.trim() ? { value: v, origin: 'typed', from: null } : NO_FOLDER;
}
/** The field committed (`info` = the path field's answer, `info.derived` = the derived text, untouched): that stays derived,
 *  a kept folder committed unchanged stays what it was, anything else is the person's (a pick, a chip, the picker, Enter). */
export function folderOnCommit(folder, info) {
  if (!info || info.derived) return folder || NO_FOLDER;
  const text = String(info.text == null ? '' : info.text);
  if (folder && !FOLLOWS.has(folder.origin) && folder.value === text) return folder;
  return folderOnEdit(folder, text);
}
/** The person left the field: an emptied folder takes what the groups give again. */
export function folderOnLeave(folder, groups = [], host = '') {
  return !folder || folder.origin === 'empty' ? groupFolder(groups, host) : folder;
}
/** What the field must SHOW after an open / a group change / leaving it (null = leave the input alone): a folder that
 *  follows is shown whenever it moved; the person's own text is never rewritten. */
export function folderShows(prev, next) {
  if (!next || !FOLLOWS.has(next.origin)) return null;
  if (prev && FOLLOWS.has(prev.origin) && prev.value === next.value && prev.from === next.from) return null;
  return next.value;
}
