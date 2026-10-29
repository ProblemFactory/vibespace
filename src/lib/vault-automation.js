// THE VAULT WINDOW'S «Automation keys» (design q-046 L1, lane automation-keys-core — the owner 2026-10-19: "之后相关可以用作自动化的
// API 都提供专门的 key 授权，存在 vault 里，内部 agent 可以被单项授权这个 key，全程不需要我看到 key"). VibeSpace's own keys: 铸造… (a name
// + the verbs it may do — the closed table), 授权给… (a multi-select picker of the live conversations and the Task Groups; a
// grant's chip ✕ takes it back), 撤销 (every grant stops, the value leaves the vault). The VALUE is never drawn here: the row's
// own 「显示」 (src/lib/vault-window.js, behind 验证是你) is the one road out, ONLY to hand to an outside party — the row says so.
// Every door is a person's (GET/POST /api/automation/… — an agent's token is refused human_only).
// Lane automation-open-limits (the q-048 verify's M2): a key that OPENS conversations carries LIMITS — the folders (a picker over
// the hub's file tree, multi), the accounts (any, or a multi-select of the roster), the permission modes and the models (from the
// harness tables; models any or chips) and the modes it may open — picked in 铸造…, edited in 边界…; a key minted before limits
// reads as folderless and shows 「Limits not set」 until the owner sets its bounds (it refuses every open meanwhile — q-049
// M1). 审计… lists the key's audit lines (a refused open with its code). Lane automation-open-permission-resolve (q-049 M2): the
// picker's `default` row says what the CLI's own setting is NOW (the hub resolves it per folder) — the hub refuses an open whose
// resolved mode the key does not list.
// Lane key-instance-scope (the owner 2026-10-20 「key 应该可以被授权在整个 vibe space 上工作」): every 授权给 chip carries the grant's REACH
// as a chip of its own — 只有它开的会话 (the default) · 这些岗位的会话 (its Task Groups) · 整个 VibeSpace (RED, its title: this key may
// act on every conversation here, including yours); a click opens the reach dialog (the same store write the first-use
// card makes — POST /api/automation/grants/:id/reach); 授权给… picks the reach of the grants it adds.
// Lane key-folder-picker-all (the owner 2026-10-21: 「这个不能选"所有路径"嘛？或者至少"所有子文件夹"吧。」 and 「我之前授权给你的 key 似乎
// 没法改变"能做什么"」): 编辑… on every key changes its verbs (the mint's checkboxes) and — while 开一个对话 is ticked — its
// limits, through the mint's own rules (POST …/keys/:id/edit); the folders offer 「所有路径」 (exactly `['/']`, red-tinted)
// or 「只有这些文件夹（含子文件夹）」 (the browser), and every folder says it covers its subfolders.
// Lane vault-key-row-compact (the owner 2026-10-21 05:4xZ: 「授权很多的时候，这个界面需要优化一下」 — two grants already made the row
// a wall of text): the row is a HEAD + folds, bounded. The head's chips COUNT — 「N 个动作」 (the verbs open as a popover grouped
// by family, 编辑… beside) and 「授权给 N 个」 (the grants open IN PLACE as a bounded list: about five rows, the rest scroll, a
// filter past eight, ended conversations dim with ONE 清理已结束的授权 — remembered per key for this page); the limits are ONE
// line of words where an unrestricted set says 任何 and more than three picks say 「N 种」 (the names in its title).
import { t } from './i18n.js';
import { fetchJson, showToast, showConfirmDialog, createModalShell, createPopover } from './utils.js';
import { SCOPES, ALL_PATHS, limitSetView, verbFamilies, grantOrder } from '../automation-keys.js'; // PURE: the closed table of verbs (their words); `/` = 「所有路径」; lane vault-key-row-compact: a limit's set in words, the verbs' families, the grants' order
import { BACKEND_META } from './agent-meta.js';
import { enterSubmits } from './chat-enter-keys.js'; // an Enter that ends an IME composition never submits
import { vaultWaitLine } from './vault-unlock.js'; // lane vault-slow-load: the audit says it is reading
import { principalPicker } from './principal-picker.js'; // lane grants-unify: 授权给… is THE picker (with its «除了» row)
import { rowToPick, principalOfRow } from './principal-picker-model.js'; // lane grants-unify: a stored exception drawn, a pick written
import { REACH_CHOICES, reachWord, reachTitle, kindOf, groupsOf } from './automation-reach.js'; // lane key-instance-scope: ONE spelling of the reach's words

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const verbWord = (verb) => { const s = SCOPES.find((x) => x.verb === verb); return s ? t(s.label) : verb; };
const whenText = (ms) => (ms ? new Date(ms).toLocaleString() : '');
const failWords = (r) => t('Not done — {reason}', { reason: (r && (r.error || r.code)) || t('server unreachable') });
const post = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const OPEN_VERB = 'conversations.open';
const FRESH_LIMITS = { cwdRoots: [], accounts: [], permissionModes: ['default'], models: 'any', modes: ['chat'] };   // PURE DEFAULT_LIMITS — a fresh key's
const MODE_WORDS = { chat: () => t('Chat'), terminal: () => t('Terminal') };
const SUBSCRIPTION = 'subscription';
const joinPath = (dir, name) => (dir === '/' ? '/' + name : `${dir}/${name}`);
let akFolderSeq = 0;   // the folders' two radios get a group name of their own per editor
/** A key's folders in words: 「所有路径」 for `/`, else each root «及子文件夹» (a root always covered its subfolders). */
const folderWords = (roots) => (roots.includes(ALL_PATHS) ? t('All paths') : roots.length ? roots.map((r) => `${r} ${t('and its subfolders')}`).join(', ') : t('none'));
/** A labelled checkbox (the window's multi-select rows) → { node, cb }. */
function limitPick(value, words, checked, cls = 'vw-ak-pick') {
  const lab = el('label', cls);
  const cb = el('input');
  cb.type = 'checkbox'; cb.value = value; cb.checked = !!checked;
  lab.append(cb, el('span', null, words));
  return { node: lab, cb };
}
/** The choices of one limit (the harness tables' rows, deduped by value) plus what the key already holds that no table
 *  lists now (an edit never drops a stored pick by itself). */
function choiceRows(rows, held) {
  const out = [];
  for (const r of rows || []) if (r && r.value && !out.some((x) => x.value === r.value)) out.push({ value: r.value, label: r.label, backends: [r.backend] });
  else if (r && r.value) out.find((x) => x.value === r.value).backends.push(r.backend);
  for (const v of Array.isArray(held) ? held : []) if (!out.some((x) => x.value === v)) out.push({ value: v, label: v, backends: [] });
  return out;
}
const choiceWord = (r) => (r.value === 'default' ? t("The CLI's own setting") : t(r.label));   // q-049 M2: `default` = no --permission flag (this machine's CLI decides) — not a cap
// lane automation-open-permission-resolve (q-049 M2): the PICKER's `default` row says what the CLI's own setting IS right now —
// the hub resolves it for the key's first folder (the hub's own folder for a fresh key): 「CLI 自己的设置（现在是 X）」; X = the
// harness table's word for the resolved mode (its built-in default when no settings file sets one). The hub judges the same.
const modeWord = (mode, ch) => { if (mode === 'default') return t('its built-in default'); const r = choiceRows((ch && ch.permissionModes) || [], []).find((x) => x.value === mode); return r ? t(r.label) : mode; };
const pickWord = (r, now, ch) => (r.value !== 'default' ? t(r.label) : now && now.mode ? t("The CLI's own setting (now {mode})", { mode: modeWord(now.mode, ch) }) : t("The CLI's own setting"));
const nowTitle = (now) => (now.layer && now.layer.file ? t('Set in {file}', { file: now.layer.file }) : t('No settings file sets a permission mode — the CLI runs its built-in default'));
/** A key's limits in words (the row's ONE line), one part per field — names only: folders, account names, the table's
 *  words. Lane vault-key-row-compact: a set equal to everything the tables offer now says 任何 (PURE limitSetView — its
 *  names in the title), more than three picks say 「N 种」 (the names in the title); never the full enumeration. → [<span>]. */
function limitsParts(limits, data) {
  const ch = (data && data.limitChoices) || {};
  const acct = (id) => (id === SUBSCRIPTION ? t("The CLI's own login") : ((ch.accounts || []).find((a) => a.id === id) || {}).name || id);
  const perm = (v) => { const r = choiceRows(ch.permissionModes, [v]).find((x) => x.value === v); return r ? choiceWord(r) : v; };
  const tables = { accounts: [SUBSCRIPTION, ...(ch.accounts || []).map((a) => a.id)], permissionModes: choiceRows(ch.permissionModes, []).map((r) => r.value), models: choiceRows(ch.models, []).map((r) => r.value) };
  const part = (field, label, v, table, word) => {
    const w = limitSetView(v, table);
    const names = w.names.map(word);
    const span = el('span', 'vw-ak-lim', `${label}: ${w.any ? t('any') : w.count ? t('{n} kinds', { n: w.n }) : names.join(', ') || t('none')}`);
    span.dataset.field = field;
    if ((w.any && names.length) || w.count) span.title = names.join(', ');
    return span;
  };
  const folders = el('span', 'vw-ak-lim', `${t('Folders')}: ${folderWords(limits.cwdRoots || [])}`);
  folders.dataset.field = 'cwdRoots';
  return [
    folders, part('accounts', t('Accounts'), limits.accounts, tables.accounts, acct), part('permissionModes', t('Permission modes'), limits.permissionModes, tables.permissionModes, perm),
    part('models', t('Models'), limits.models, tables.models, (x) => (x === 'default' ? t("The CLI's own setting") : x)), part('modes', t('Modes'), limits.modes, ['chat', 'terminal'], (m) => (MODE_WORDS[m] ? MODE_WORDS[m]() : m)),
  ];
}

/** THE LIMITS EDITOR (铸造… and 编辑…) → { node, value() }. `initial` null = a fresh mint: the editor starts from a fresh
 *  key's limits and NOTHING changes until the owner saves (a pre-limits key now reads as those same folderless limits). */
function limitsEditor(initial, data, now = null) {
  const ch = (data && data.limitChoices) || { accounts: [], permissionModes: [], models: [] };
  const L = initial || FRESH_LIMITS;
  const box = el('div', 'vw-ak-limits');
  // FOLDERS — lane key-folder-picker-all: two choices ABOVE the browser — 「所有路径」 (exactly `['/']`: any folder here, your
  // home included — red-tinted, its title says so) and 「只有这些文件夹（含子文件夹）」: a picker over the hub's file tree (GET
  // /api/files, the file explorer's door), multi — each added folder a chip that says it covers its subfolders
  const roots = (L.cwdRoots || []).filter((r) => r !== ALL_PATHS);
  const seg = el('div', 'vw-ak-seg');
  const segName = `vw-ak-folders-${++akFolderSeq}`;
  const segPick = (value, words, cls) => { const lab = el('label', `vw-ak-pick ${cls}`); const rb = el('input'); rb.type = 'radio'; rb.name = segName; rb.value = value; lab.append(rb, el('span', null, words)); seg.append(lab); return { node: lab, rb }; };
  const allPick = segPick('all', t('All paths'), 'vw-ak-allpaths');
  allPick.node.title = t('Any folder on this VibeSpace, including your home');
  const somePick = segPick('some', t('Only these folders (with their subfolders)'), 'vw-ak-somepaths');
  allPick.rb.checked = (L.cwdRoots || []).includes(ALL_PATHS);
  somePick.rb.checked = !allPick.rb.checked;
  const some = el('div', 'vw-ak-some');
  const syncSeg = () => { some.hidden = allPick.rb.checked; };
  allPick.rb.onchange = syncSeg; somePick.rb.onchange = syncSeg;
  const chips = el('div', 'vw-ak-roots');
  const drawRoots = () => chips.replaceChildren(...(roots.length ? roots.map((r) => {
    const c = el('span', 'vw-ak-chip vw-ak-root');
    c.dataset.root = r;
    const x = el('button', 'vw-ak-x', '✕');
    x.type = 'button'; x.title = t('Remove'); x.setAttribute('aria-label', x.title);
    x.onclick = () => { roots.splice(roots.indexOf(r), 1); drawRoots(); };
    c.append(el('span', null, r), el('span', 'vw-ak-sub', t('and its subfolders')), x);
    return c;
  }) : [el('span', 'vw-ak-none', t('No folder yet'))]));
  drawRoots();
  const here = el('div', 'vw-ak-here');
  const up = el('button', 'vw-btn vw-ak-up', '↑');
  up.type = 'button'; up.title = t('Parent folder'); up.setAttribute('aria-label', up.title);
  const pathIn = el('input', 'vw-ak-path');
  pathIn.type = 'text'; pathIn.spellcheck = false; pathIn.setAttribute('aria-label', t('Folder'));
  const add = el('button', 'vw-btn vw-ak-add-root', t('Add this folder and its subfolders'));
  add.type = 'button';
  here.append(up, pathIn, add);
  const dirs = el('div', 'vw-ak-dirs');
  let cur = '';
  const go = async (p) => {
    const r = await fetchJson(`/api/files${p ? `?path=${encodeURIComponent(p)}` : ''}`);
    if (!r || r.error || !Array.isArray(r.items)) { showToast(failWords({ error: r && r.error }), { type: 'error' }); return; }
    cur = String(r.path || p || '/'); pathIn.value = cur;
    dirs.replaceChildren(...r.items.filter((i) => i && i.isDirectory).slice(0, 300).map((i) => {
      const b = el('button', 'vw-ak-dir', i.name);
      b.type = 'button'; b.dataset.path = joinPath(cur, i.name);
      b.onclick = () => go(b.dataset.path);
      return b;
    }));
  };
  up.onclick = () => go(cur.replace(/\/[^/]+\/?$/, '') || '/');
  pathIn.onkeydown = (e) => { if (enterSubmits(e)) { e.preventDefault(); go(pathIn.value.trim()); } };
  add.onclick = () => {
    const p = pathIn.value.trim() || cur;
    if (!p.startsWith('/')) { showToast(t('A folder is an absolute path'), { type: 'error' }); return; }
    if (/^\/+$/.test(p)) { allPick.rb.checked = true; syncSeg(); return; }   // the root itself IS 「所有路径」 — said as such, never a bare `/` chip
    if (!roots.includes(p)) { roots.push(p); drawRoots(); }
  };
  some.append(chips, here, dirs);
  syncSeg();
  box.append(el('div', 'vw-ak-sec', t('Folders')), seg, some);
  go(roots[0] || '');
  // ACCOUNTS — any, or a multi-select of the roster (+ the CLI's own login); a fresh key has none until the owner picks
  const acctAny = limitPick('any', t('Any account'), L.accounts === 'any', 'vw-ak-pick vw-ak-acct-any');
  const acctList = el('div', 'vw-ak-accts');
  const held = Array.isArray(L.accounts) ? L.accounts : [];
  const acctRows = [{ id: SUBSCRIPTION, words: t("The CLI's own login") }, ...(ch.accounts || []).map((a) => ({ id: a.id, words: `${a.name} · ${a.id}` }))];
  for (const id of held) if (!acctRows.some((a) => a.id === id)) acctRows.push({ id, words: id });
  const acctBoxes = acctRows.map((a) => { const p = limitPick(a.id, a.words, held.includes(a.id)); acctList.append(p.node); return p.cb; });
  const syncAcct = () => { acctList.hidden = acctAny.cb.checked; };
  acctAny.cb.onchange = syncAcct; syncAcct();
  box.append(el('div', 'vw-ak-sec', t('Accounts')), acctAny.node, acctList);
  // PERMISSION MODES — checkboxes from the harness tables (default = the harness's own: the open names none)
  // a mode only some harnesses offer says whose it is (Codex's 只读 beside Claude's 规划模式); one every harness offers says nothing
  const permList = el('div', 'vw-ak-perms');
  const permHarnesses = [...new Set((ch.permissionModes || []).map((r) => r.backend))];
  const whose = (r) => (r.backends.length && r.backends.length < permHarnesses.length ? ` · ${r.backends.map((b) => (BACKEND_META[b] && BACKEND_META[b].label) || b).join(', ')}` : '');
  const permBoxes = choiceRows(ch.permissionModes, L.permissionModes).map((r) => { const p = limitPick(r.value, pickWord(r, now, ch) + whose(r), (L.permissionModes || []).includes(r.value)); if (r.value === 'default' && now) { p.node.title = nowTitle(now); p.node.dataset.now = now.mode; } permList.append(p.node); return p.cb; });
  box.append(el('div', 'vw-ak-sec', t('Permission modes')), permList);
  // MODELS — any, or chips: the harness tables' models + another id typed in
  const modelAny = limitPick('any', t('Any model'), L.models === 'any', 'vw-ak-pick vw-ak-model-any');
  const modelList = el('div', 'vw-ak-models');
  const modelBoxes = [];
  const addModel = (r, checked) => { const p = limitPick(r.value, r.value === 'default' ? t("The CLI's own setting") : r.value, checked, 'vw-ak-pick vw-ak-model'); p.node.title = t(r.label); modelList.insertBefore(p.node, modelMore); modelBoxes.push(p.cb); return p.cb; };
  const modelMore = el('div', 'vw-ak-here');
  const modelIn = el('input', 'vw-ak-path vw-ak-model-in');
  modelIn.type = 'text'; modelIn.spellcheck = false; modelIn.placeholder = t('Another model id'); modelIn.setAttribute('aria-label', modelIn.placeholder);
  const modelAdd = el('button', 'vw-btn vw-ak-model-add', t('Add'));
  modelAdd.type = 'button';
  modelAdd.onclick = () => { const v = modelIn.value.trim(); if (!v) return; const had = modelBoxes.find((b) => b.value === v); if (had) had.checked = true; else addModel({ value: v, label: v }, true); modelIn.value = ''; };
  modelIn.onkeydown = (e) => { if (enterSubmits(e)) { e.preventDefault(); modelAdd.onclick(); } };
  modelMore.append(modelIn, modelAdd);
  modelList.append(modelMore);
  for (const r of choiceRows(ch.models, Array.isArray(L.models) ? L.models : [])) addModel(r, Array.isArray(L.models) && L.models.includes(r.value));
  const syncModel = () => { modelList.hidden = modelAny.cb.checked; };
  modelAny.cb.onchange = syncModel; syncModel();
  box.append(el('div', 'vw-ak-sec', t('Models')), modelAny.node, modelList);
  // MODES — chat (a fresh key's) / terminal only when listed
  const modeList = el('div', 'vw-ak-modes');
  const modeBoxes = ['chat', 'terminal'].map((m) => { const p = limitPick(m, MODE_WORDS[m](), (L.modes || []).includes(m)); modeList.append(p.node); return p.cb; });
  box.append(el('div', 'vw-ak-sec', t('Modes')), modeList);
  const checked = (list) => list.filter((b) => b.checked).map((b) => b.value);
  return {
    node: box,
    value: () => ({ cwdRoots: allPick.rb.checked ? [ALL_PATHS] : roots.slice(), accounts: acctAny.cb.checked ? 'any' : checked(acctBoxes), permissionModes: checked(permBoxes), models: modelAny.cb.checked ? 'any' : checked(modelBoxes), modes: checked(modeBoxes) }),
  };
}

/** 能做什么: the closed table's verbs as checkboxes (a billed verb says so) — 铸造… (none ticked) and 编辑… (the key's own;
 *  a verb a later release added shows unticked). → { node, boxes }. */
function verbPicks(held = []) {
  const verbs = el('div', 'vw-ak-verbs');
  const boxes = [];
  for (const s of SCOPES) {
    const lab = el('label', 'vw-ak-pick');
    const cb = el('input');
    cb.type = 'checkbox'; cb.value = s.verb; cb.checked = held.includes(s.verb);
    lab.append(cb, el('span', null, t(s.label) + (s.billed ? ' ' + t('(starts a billed turn)') : '')));
    verbs.append(lab);
    boxes.push(cb);
  }
  return { node: verbs, boxes };
}
/** The limits shown while 开一个对话 is ticked (absent, never greyed, otherwise) — 铸造… and 编辑… alike. */
function limitsFollowOpen(boxes, limWrap) {
  const openCb = boxes.find((b) => b.value === OPEN_VERB);
  const syncLim = () => { limWrap.hidden = !(openCb && openCb.checked); };
  if (openCb) openCb.addEventListener('change', syncLim);
  syncLim();
}

/** 编辑… (lane key-folder-picker-all): a minted key's verbs and — while 开一个对话 is ticked — its limits (a key minted before
 *  limits gets its FIRST ones here). Nothing changes until 保存; the key's value never changes; a verb added rides the
 *  key's grants (the hint says so — no new first-use card); a verb taken away is refused from its next call. */
export function showEditDialog(key, data, { refresh } = {}) {
  // lane dialog-unsaved-guard: a verb or a limit changed and not saved ⇒ ✕ / Esc / the backdrop asks
  // not the subject: data — the vault's catalog (the subjects and choices it offers), the same for every key
  const { body, close, raised } = createModalShell({ id: 'vault-ak-edit', key: key.id, title: t('Edit "{name}"', { name: key.name }), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true,
    unsaved: { isDirty: () => drawn() !== base, save: () => doSave() }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const vp = verbPicks(key.scopes);
  body.append(el('div', 'vw-ak-sec', t('What it may do')), vp.node,
    el('div', 'vw-ak-hint vw-ak-grant-hint', t('A verb you add works at once wherever this key is granted — a grant is for the key and a conversation, not for each verb; a verb you take away is refused from its next call.')));
  const limWrap = el('div', 'vw-ak-limwrap');
  if (!key.limits.cwdRoots.length) limWrap.append(el('div', 'vw-ak-hint vw-ak-first', t('This key has no folders yet — what you save here becomes its bounds. Until you set at least one folder, every conversation it would open is refused.')));
  const ed = limitsEditor(key.limits, data, key.permissionNow || ((data && data.limitChoices) || {}).permissionNow || null);   // q-049 M2: resolved for the key's first folder
  limWrap.append(el('div', 'vw-ak-sec', t('What the conversations it opens may use')), ed.node);
  body.append(limWrap);
  limitsFollowOpen(vp.boxes, limWrap);
  const drawn = () => JSON.stringify([vp.boxes.filter((b) => b.checked).map((b) => b.value), ed.value()]);
  const base = drawn();
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-ak-edit-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  const doSave = async () => {
    const scopes = vp.boxes.filter((b) => b.checked).map((b) => b.value);
    const r = await post(`/api/automation/keys/${encodeURIComponent(key.id)}/edit`, { scopes, ...(scopes.includes(OPEN_VERB) ? { limits: ed.value() } : {}) });
    if (!r || !r.ok) { showToast(failWords(r), { type: 'error' }); return false; }
    showToast(t('Saved'));
    close();
    refresh?.();
    return true;
  };
  save.onclick = () => { doSave(); };
  f.append(cancel, save);
  body.parentNode.append(f);
}

/** 审计…: the key's audit lines, newest first (who · verb · allowed or the refusal's code) — names and ids only. */
export async function showAuditDialog(key, data) {
  const { body, close, raised } = createModalShell({ id: 'vault-ak-audit', key: key.id, title: t('Audit of "{name}"', { name: key.name }), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true, kind: 'form' });
  if (raised) return;   // raised: the same subject's form, as it was
  const list = el('div', 'vw-ak-audit-list');
  body.append(list);
  const f = el('div', 'dialog-footer');
  const done = el('button', 'btn-cancel', t('Close'));
  done.type = 'button'; done.onclick = () => close();
  f.append(done);
  body.parentNode.append(f);
  const wait = vaultWaitLine(t('Reading the audit…'));
  list.append(wait);
  const r = await fetchJson(`/api/automation/keys/${encodeURIComponent(key.id)}/audit?limit=50`);
  wait.remove();
  if (!r || !r.ok) { list.append(el('div', 'vw-empty', failWords(r))); return; }
  if (!r.lines.length) { list.append(el('div', 'vw-empty', t('No audit line for this key yet'))); return; }
  for (const l of r.lines) {
    const row = el('div', 'vw-ak-audit-line' + (l.ok ? '' : ' vw-ak-refused'));
    row.dataset.verb = l.verb || ''; row.dataset.code = l.code || '';
    // a use: who called · the verb · allowed or the refusal's code; an owner's act (key.mint / .grant / .limits / …): you · the act → whom
    const own = /^key\./.test(String(l.verb || ''));
    row.append(el('span', 'vw-ak-when', whenText(Date.parse(l.at))), el('span', 'vw-ak-who', own || l.subject === 'owner' ? t('You') : subjectName(l.subject, data)),
      el('span', 'vw-ak-verb', SCOPES.some((x) => x.verb === l.verb) ? verbWord(l.verb) : l.verb));
    if (own) { if (l.subject && l.subject !== 'owner') row.append(el('span', 'vw-ak-arg', '→ ' + subjectName(l.subject, data))); }
    else row.append(el('span', 'vw-ak-outcome', l.ok ? t('Allowed') : l.code));
    if (l.args && l.args.cwd) row.append(el('span', 'vw-ak-arg', l.args.cwd));
    if (own && l.note) row.append(el('span', 'vw-ak-arg', l.note));   // lane vault-key-row-compact: what an owner's act changed (key.scopes) or took back (key.prune)
    list.append(row);
  }
}

/** The keys, their grants, the picker's subjects (GET /api/automation/keys) — null when the door refuses (locked, …). */
export async function loadAutomation() {
  const r = await fetchJson('/api/automation/keys');
  return r && r.ok ? r : null;
}
/** A subject's name for a chip: a conversation's / a Task Group's own name (the picker's list), else its id. */
function subjectName(subject, data) {
  const all = [...((data && data.subjects && data.subjects.sessions) || []), ...((data && data.subjects && data.subjects.groups) || [])];
  const hit = all.find((s) => s.subject === subject);
  if (hit) return hit.name;
  return String(subject).replace(/^session:/, '').replace(/^group:/, t('Task group') + ' ');
}

// lane vault-key-row-compact: the grants fold and its filter, per key, for this page — a row drawn again keeps them
const grantsOpen = new Set();
const grantsQuery = new Map();
const GRANT_FILTER_PAST = 8;   // a filter box appears when a key has more grants than this
const SVG_NS = 'http://www.w3.org/2000/svg';
/** A 16-unit stroke glyph built node by node (a Task Group's 岗位 sheet / a conversation's bubble). */
function glyph(shapes) {
  const g = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'vw-ak-gico' })) g.setAttribute(k, String(v));
  for (const [tag, attrs] of shapes) { const c = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) c.setAttribute(k, String(v)); g.append(c); }
  return g;
}
const GROUP_GLYPH = [['rect', { x: 2, y: 2, width: 12, height: 12, rx: 1.5 }], ['path', { d: 'M5 6h6M5 9h6M5 12h3' }]];
const CHAT_GLYPH = [['path', { d: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z' }]];
/** A grant's name: the conversation's / the Task Group's own (the picker's live list), an ended conversation's the name the
 *  sidebar kept (the hub sends it), else the id — a conversation's shortened to 8 characters. */
function grantName(g, data) {
  const all = [...((data && data.subjects && data.subjects.sessions) || []), ...((data && data.subjects && data.subjects.groups) || [])];
  const hit = all.find((s) => s.subject === g.subject);
  if (hit) return hit.name;
  if (g.name) return g.name;
  const s = String(g.subject);
  if (s.startsWith('group:')) return `${t('Task group')} ${s.slice(6)}`;
  const id = s.replace(/^session:/, '');
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
/** ONE grant's row: its name (a Task Group with its 岗位 glyph, a conversation with its state), the reach chip (a click
 *  changes it — lane key-instance-scope), ✕ (takes it back). → { node, words } (`words` = what the filter matches). */
function grantRow(g, key, data, { refresh } = {}) {
  const isGroup = String(g.subject).startsWith('group:');
  const r = el('div', `vw-ak-g${g.ended ? ' vw-ak-g-ended' : ''}`);
  r.dataset.subject = g.subject; r.setAttribute('role', 'listitem');
  const nm = el('span', 'vw-ak-gname', g.name + (g.mode === 'once' ? ` (${t('once')}${g.spentAt ? ', ' + t('used') : ''})` : ''));
  nm.title = isGroup ? `${t('Task group')} · ${g.name}` : g.name === String(g.subject).replace(/^session:/, '') ? g.name : `${g.name} · ${String(g.subject).replace(/^session:/, '')}`;
  r.append(glyph(isGroup ? GROUP_GLYPH : CHAT_GLYPH), nm);
  if (!isGroup) r.append(el('span', `vw-ak-gstate${g.ended ? ' vw-ak-gstate-ended' : ''}`, g.ended ? t('ended') : t('Live')));
  if (isGroup && Array.isArray(g.except) && g.except.length) r.append(el('span', 'vw-ak-gexcept', t('Except: {n} left out', { n: g.except.length })));   // lane grants-unify: «除了» (授权给… edits it)
  const kind = kindOf(g.reach), ids = groupsOf(g.reach);
  const rc = el('button', `vw-ak-reach vw-ak-reach-${kind}`, reachWord(kind));
  rc.type = 'button'; rc.dataset.reach = kind;
  rc.title = kind === 'instance' ? reachTitle(kind) : `${reachTitle(kind, ids.map((id) => subjectName(`group:${id}`, data)).join(', '))} — ${t('Change the reach…')}`;
  rc.setAttribute('aria-label', `${t('Reach')}: ${reachWord(kind)}`);
  rc.onclick = () => showReachDialog(key, g, data, { refresh });
  const x = el('button', 'vw-ak-x', '✕');
  x.type = 'button'; x.title = t('Take this grant back'); x.setAttribute('aria-label', x.title);
  x.onclick = async () => { const res = await fetchJson(`/api/automation/grants/${encodeURIComponent(g.id)}`, { method: 'DELETE' }); if (!res || !res.ok) showToast(failWords(res), { type: 'error' }); refresh?.(); };
  r.append(rc, x);
  return { node: r, words: `${g.name} ${g.subject} ${g.ended ? t('ended') : ''}`.toLowerCase() };
}
/** THE GRANTS, BOUNDED (lane vault-key-row-compact): one row per grant — Task Groups, then running conversations, then ended
 *  ones (dim, 已结束), each by name (PURE grantOrder); about five rows show and the rest SCROLL inside the row (never a 显示更多);
 *  a filter box past eight grants; ended grants get ONE door, 清理已结束的授权, with their count beside it (POST
 *  …/keys/:id/prune-ended — a grant to a conversation that is gone can never be used; the audit line says what went). */
function grantsFold(key, data, { refresh } = {}) {
  const fold = el('div', 'vw-ak-gfold');
  fold.id = `vw-ak-gfold-${key.id}`;
  fold.hidden = !grantsOpen.has(key.id);
  const rows = grantOrder(key.grants.map((g) => ({ ...g, name: grantName(g, data) })));
  const list = el('div', 'vw-ak-glist');
  list.setAttribute('role', 'list'); list.setAttribute('aria-label', t('Granted to'));
  const items = rows.map((g) => { const it = grantRow(g, key, data, { refresh }); list.append(it.node); return it; });
  const none = el('div', 'vw-ak-gnone');
  none.hidden = true;
  if (rows.length > GRANT_FILTER_PAST) {
    const q = el('input', 'vw-ak-gfilter');
    q.type = 'search'; q.spellcheck = false; q.placeholder = t('Filter the grants…'); q.setAttribute('aria-label', q.placeholder);
    const apply = () => {
      const v = q.value.trim().toLowerCase();
      grantsQuery.set(key.id, q.value);
      let shown = 0;
      for (const it of items) { it.node.hidden = !!v && !it.words.includes(v); if (!it.node.hidden) shown++; }
      none.textContent = t('No grant matches “{q}”', { q: q.value.trim() });
      none.hidden = shown > 0;
    };
    q.value = grantsQuery.get(key.id) || '';
    q.oninput = apply;
    fold.append(q);
    if (q.value) apply();
  }
  fold.append(list, none);
  const ended = rows.filter((g) => g.ended);
  if (ended.length) {
    const foot = el('div', 'vw-ak-gfoot');
    const prune = el('button', 'vw-btn vw-ak-prune', t('Clean up ended grants'));
    prune.type = 'button';
    prune.title = t('Takes back every grant to a conversation that is not running — such a grant can never be used; if that conversation comes back, its next use asks you again');
    const n = el('span', 'vw-chip vw-ak-ended-n', String(ended.length));
    n.title = t('{n} grants to conversations that ended', { n: ended.length });
    prune.onclick = async () => {
      if (prune._vwBusy) return;   // a re-entry guard, never a greyed control
      prune._vwBusy = true;
      try {
        const r = await post(`/api/automation/keys/${encodeURIComponent(key.id)}/prune-ended`);
        if (!r || !r.ok) { showToast(failWords(r), { type: 'error' }); return; }
        showToast(t('Took back {n} grants to ended conversations', { n: (r.removed || []).length }));
        refresh?.();
      } finally { prune._vwBusy = false; }
    };
    foot.append(prune, n);
    fold.append(foot);
  }
  return fold;
}
/** 「N 个动作」's popover: the key's verbs grouped by family (the closed table's own groups — PURE verbFamilies), a billed
 *  verb says so, 编辑… beside (lane vault-key-row-compact: the run-on sentence is gone). */
function showVerbs(anchor, key, data, { refresh } = {}) {
  const pop = createPopover(anchor, 'vw-ak-verbs-pop');
  if (pop._closedByAnchor) return;   // the chip pressed again: closed
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', t('What it may do'));
  for (const f of verbFamilies(key.scopes)) {
    const sec = el('div', 'vw-ak-vfam');
    sec.dataset.family = f.id;
    sec.append(el('div', 'vw-ak-vfam-name', t(f.label)));
    for (const v of f.verbs) { const s = SCOPES.find((x) => x.verb === v); sec.append(el('div', 'vw-ak-vrow', verbWord(v) + (s && s.billed ? ' ' + t('(starts a billed turn)') : ''))); }
    pop.append(sec);
  }
  const edit = el('button', 'vw-btn vw-ak-vedit', t('Edit…'));
  edit.type = 'button';
  edit.onclick = () => { pop.remove(); showEditDialog(key, data, { refresh }); };
  pop.append(edit);
}

/** The extras an «Automation keys» row carries (lane vault-key-row-compact — a HEAD + folds, bounded): `chips` for the row's
 *  head (「N 个动作」 · 「授权给 N 个」), `box` under it (the limits in ONE line, the grants fold), and its doors. */
export function automationExtras(row, data, { refresh } = {}) {
  const id = String(row.entry || '').replace(/^apikey:/, '');
  const key = ((data && data.keys) || []).find((k) => k.id === id) || null;
  const box = el('div', 'vw-ak');
  box.dataset.key = id;
  if (!key) return { box, doors: [], chips: [] };
  const chips = [];
  const verbsB = el('button', 'vw-chip vw-ak-verbs-chip', key.scopes.length === 1 ? t('1 thing it may do') : t('{n} things it may do', { n: key.scopes.length }));
  verbsB.type = 'button'; verbsB.title = t('What it may do'); verbsB.setAttribute('aria-haspopup', 'dialog');
  verbsB.onclick = () => showVerbs(verbsB, key, data, { refresh });
  chips.push(verbsB);
  let fold = null;
  if (!key.grants.length) chips.push(el('span', 'vw-ak-none', t('Not granted to anything yet')));
  else {
    fold = grantsFold(key, data, { refresh });
    const ended = key.grants.filter((g) => g.ended).length;
    const gb = el('button', `vw-chip vw-ak-grants-chip${ended ? ' vw-ak-has-ended' : ''}`, t('Granted to {n}', { n: key.grants.length }));
    gb.type = 'button'; gb.setAttribute('aria-controls', fold.id); gb.setAttribute('aria-expanded', fold.hidden ? 'false' : 'true');
    gb.title = ended ? t('{n} grants to conversations that ended', { n: ended }) : t('Show the grants');
    gb.onclick = () => { const open = fold.hidden; fold.hidden = !open; if (open) grantsOpen.add(key.id); else grantsOpen.delete(key.id); gb.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    chips.push(gb);
  }
  // lane automation-open-limits: what the conversations it opens may use — or 「Limits not set」 on a folderless key (q-049 M1)
  const opens = key.scopes.includes(OPEN_VERB);
  if (opens) {
    const line = el('div', 'vw-ak-limits-line');
    if (!key.limits.cwdRoots.length) {
      const chip = el('span', 'vw-ak-unbounded', t('Limits not set'));
      chip.title = t('No folders are set — every conversation it would open is refused until you set them with Edit…');
      line.append(chip);
    } else {
      // lane vault-key-row-compact: ONE line of words (was one line per field) — 任何 for an unrestricted set, 「N 种」 past three
      limitsParts(key.limits, data).forEach((p, i) => { if (i) line.append(el('span', 'vw-ak-sep', ' · ')); line.append(p); });
      if (key.limits.cwdRoots.includes(ALL_PATHS)) { const fl = line.firstChild; fl.classList.add('vw-ak-allpaths'); fl.title = t('Any folder on this VibeSpace, including your home'); }   // 「所有路径」 red-tinted
    }
    box.append(line);
  }
  if (fold) box.append(fold);
  // lane key-folder-picker-all: 编辑… on EVERY key — its verbs (a verb a later release added) and, when it opens, its limits
  const editB = el('button', 'vw-btn vw-ak-edit', t('Edit…'));
  editB.type = 'button';
  editB.onclick = () => showEditDialog(key, data, { refresh });
  const auditB = el('button', 'vw-btn vw-ak-audit', t('Audit…'));
  auditB.type = 'button';
  auditB.onclick = () => showAuditDialog(key, data);
  const grantB = el('button', 'vw-btn vw-ak-grant', t('Grant to…'));
  grantB.type = 'button';
  grantB.onclick = () => showGrantPicker(key, data, { refresh });
  const revokeB = el('button', 'vw-btn vw-del vw-ak-revoke', t('Revoke'));
  revokeB.type = 'button';
  revokeB.onclick = async () => {
    if (!(await showConfirmDialog({ title: t('Revoke "{name}"?', { name: key.name }), message: t('Every grant of it stops at once and its value leaves the vault. What it already did stays in the audit.'), confirmText: t('Revoke'), danger: true }))) return;
    const r = await post(`/api/automation/keys/${encodeURIComponent(key.id)}/revoke`);
    if (!r || !r.ok) { showToast(failWords(r), { type: 'error' }); return; }
    showToast(t('Revoked'));
    refresh?.();
  };
  return { box, doors: [grantB, editB, auditB, revokeB], chips };
}

/** The three reach rows (radios) + the Task Groups list the groups row opens — `initial` = a stored reach (the dialog) or
 *  null (the picker: opened). → { node, value() } where value() = 'opened' | 'instance' | { taskGroups } | null (groups, none picked). */
function reachRows(initial, data, { id }) {
  const box = el('div', 'vw-ak-reach-rows');
  const kind = initial ? kindOf(initial) : 'opened', had = initial ? groupsOf(initial) : [];
  const groups = ((data && data.subjects && data.subjects.groups) || []).map((g) => ({ id: String(g.subject).replace(/^group:/, ''), name: g.name }));
  for (const h of had) if (!groups.some((g) => g.id === h)) groups.push({ id: h, name: h });   // a group the store names that the picker no longer lists
  const radios = [], gboxes = [];
  const glist = el('div', 'vw-ak-reach-groups');
  for (const r of REACH_CHOICES) {
    if (r === 'groups' && !groups.length) continue;
    const lab = el('label', `vw-ak-pick vw-ak-reach-row vw-ak-reach-${r}`);
    const rb = el('input'); rb.type = 'radio'; rb.name = `vw-ak-reach-${id}`; rb.value = r; rb.checked = r === kind;
    lab.title = reachTitle(r, had.map((h) => (groups.find((g) => g.id === h) || { name: h }).name).join(', '));
    lab.append(rb, el('span', null, reachWord(r)));
    box.append(lab);
    radios.push(rb);
    if (r === 'groups') {
      for (const g of groups) {
        const gl = el('label', 'vw-ak-pick vw-ak-reach-group');
        const cb = el('input'); cb.type = 'checkbox'; cb.value = g.id; cb.checked = had.includes(g.id);
        gl.append(cb, el('span', null, g.name));
        glist.append(gl); gboxes.push(cb);
      }
      box.append(glist);
    }
  }
  const sync = () => { glist.hidden = !radios.some((r) => r.value === 'groups' && r.checked); };
  for (const r of radios) r.addEventListener('change', sync);
  sync();
  const value = () => { const k = (radios.find((r) => r.checked) || {}).value || 'opened'; if (k !== 'groups') return k; const ids = gboxes.filter((b) => b.checked).map((b) => b.value); return ids.length ? { taskGroups: ids } : null; };
  return { node: box, value };
}
/** The reach dialog (lane key-instance-scope): one grant's reach, changed — the key row's chip opens it; 保存 writes it. */
export function showReachDialog(key, g, data, { refresh } = {}) {
  // lane dialog-unsaved-guard: the reach changed and not saved ⇒ ✕ / Esc / the backdrop asks
  // not the subject: data — the vault's catalog (the subjects and choices it offers), the same for every key
  const { body, close, raised } = createModalShell({ id: 'vault-ak-reach', key: `${key.id}:${g.subject}`, title: t('Reach of "{name}" for {subject}', { name: key.name, subject: subjectName(g.subject, data) }), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true,
    unsaved: { isDirty: () => JSON.stringify(rows.value()) !== base, save: () => doSave() }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  body.append(el('div', 'vw-ak-hint', t('Which other conversations that conversation may rename, end or archive with this key. What it opened, what a grant names and itself are always within reach.')));
  const rows = reachRows(g.reach, data, { id: g.id });
  body.append(rows.node);
  const base = JSON.stringify(rows.value());
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-ak-reach-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  const doSave = async () => {
    const v = rows.value();
    if (v === null) { showToast(t('Pick at least one Task Group'), { type: 'error' }); return false; }
    const r = await post(`/api/automation/grants/${encodeURIComponent(g.id)}/reach`, { reach: v });
    if (!r || !r.ok) { showToast(failWords(r), { type: 'error' }); return false; }
    showToast(t('Saved'));
    close();
    refresh?.();
    return true;
  };
  save.onclick = () => { doSave(); };
  f.append(cancel, save);
  body.parentNode.append(f);
}

/** 授权给…: THE principal picker (lane grants-unify — it was a hand-made checkbox list) over every live conversation and
 *  Task Group, multi-select; picked = granted (a chip removed takes that grant back). With a Task Group picked, its
 *  folded «除了» row leaves members OUT — they never use the key through that group (each Task Group grant's row of the
 *  ONE grants store; a member's own grant still counts). */
export function showGrantPicker(key, data, { refresh } = {}) {
  // lane dialog-unsaved-guard: a pick or the new grants' reach changed and not saved ⇒ ✕ / Esc / the backdrop asks
  let picker = null;
  // not the subject: data — the vault's catalog (the subjects and choices it offers), the same for every key
  const { body, close, raised } = createModalShell({ id: 'vault-ak-grant', key: key.id, title: t('Grant "{name}" to', { name: key.name }), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true,
    unsaved: { isDirty: () => drawn() !== base, save: () => doSave() }, onClose: () => { if (picker) picker.close(); }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const subjects = (data && data.subjects) || { sessions: [], groups: [] };
  const always = key.grants.filter((g) => g.mode === 'always');
  const had = new Map(always.map((g) => [g.subject, g.id]));
  // the picker's rows: the Task Groups, the running conversations (with their groups — the «除了» row offers a picked
  // group's members), and every subject a grant names that is not running now (kept, said so)
  const live = [
    ...(subjects.groups || []).map((g) => ({ key: g.subject, kind: 'group', id: String(g.subject).replace(/^group:/, ''), name: g.name, groupIds: [], groupNames: [] })),
    ...(subjects.sessions || []).map((x) => ({ key: x.subject, kind: 'agent', id: String(x.subject).replace(/^session:/, ''), name: x.name, backend: x.backend, groupIds: x.groupIds || [], groupNames: [] })),
  ];
  for (const g of always) if (!live.some((r) => r.key === g.subject) && /^(session|group):/.test(g.subject)) {
    const grp = g.subject.startsWith('group:');
    live.push({ key: g.subject, kind: grp ? 'group' : 'agent', id: g.subject.replace(/^(session|group):/, ''), name: grantName(g, data), hint: grp ? t('a deleted Task Group') : t('not running now'), groupIds: [], groupNames: [] });
  }
  const storedExcept = [];
  for (const g of always) for (const x of g.except || []) if (!storedExcept.some((y) => JSON.stringify(y) === JSON.stringify(x))) storedExcept.push(x);
  const exPick = rowToPick({ to: [], except: storedExcept }, live, { notRunning: t('not running now'), deletedGroup: t('a deleted Task Group') });
  const exRows = () => [...live, ...exPick.extra];
  picker = principalPicker({ items: () => live, multi: true, selected: [...had.keys()].filter((k) => live.some((r) => r.key === k)), autofocus: true,
    placeholder: t('Search sessions and groups…'), label: t('Grant "{name}" to', { name: key.name }), emptyText: t('Nothing to pick: no conversation is running and there is no task group'),
    except: { selected: exPick.except, extra: exPick.extra } });
  body.append(picker.el);
  // lane key-instance-scope: the reach of the grants this save ADDS (an existing grant's reach is its chip's)
  body.append(el('div', 'vw-ak-sec', t('Reach of the grants you add')));
  const rows = reachRows(null, data, { id: 'picker' });
  body.append(rows.node);
  body.append(el('div', 'vw-ak-hint', t('A conversation granted the key uses it with its own session — it never sees the key\'s value.')));
  const exceptNow = () => picker.except().map((k) => principalOfRow(exRows().find((r) => String(r.key) === String(k)))).filter(Boolean);
  const drawn = () => JSON.stringify([picker.selected().slice().sort(), rows.value(), exceptNow()]);
  const base = drawn();
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-ak-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  const doSave = async () => {
    const sel = new Set(picker.selected());
    const add = [...sel].filter((k) => !had.has(k));
    const drop = [...had.keys()].filter((k) => !sel.has(k)).map((k) => had.get(k));
    const reach = rows.value();
    const except = exceptNow();
    if (add.length && reach === null) { showToast(t('Pick at least one Task Group'), { type: 'error' }); return false; }
    let bad = null;
    if (add.length) { const r = await post(`/api/automation/keys/${encodeURIComponent(key.id)}/grants`, { subjects: add, reach, except }); if (!r || !r.ok) bad = r || {}; }
    for (const gid of drop) { const r = await fetchJson(`/api/automation/grants/${encodeURIComponent(gid)}`, { method: 'DELETE' }); if (!r || !r.ok) bad = r || {}; }
    // «除了» on the Task Group grants this save keeps — written only where it changed
    const wire = JSON.stringify(except);
    for (const g of always) if (sel.has(g.subject) && g.subject.startsWith('group:') && JSON.stringify(g.except || []) !== wire) { const r = await post(`/api/automation/grants/${encodeURIComponent(g.id)}/except`, { except }); if (!r || !r.ok) bad = r || {}; }
    if (bad) showToast(failWords(bad), { type: 'error' }); else showToast(t('Saved'));
    close();
    refresh?.();
    return true;
  };
  save.onclick = () => { doSave(); };
  f.append(cancel, save);
  body.parentNode.append(f);
}

/** 铸造…: a name + the verbs it may do (the closed table; a billed verb says so) + — when it may open conversations — the
 *  limits of what they may use (lane automation-open-limits). The value is sealed and never shown here. */
export function showMintDialog({ refresh, data = null } = {}) {
  // lane dialog-unsaved-guard: a name typed or a verb ticked and not minted ⇒ ✕ / Esc / the backdrop asks (Mint / Discard /
  // Keep editing); Discard clears what was typed from the page
  // one subject: one key being minted
  const { body, close, raised } = createModalShell({ id: 'vault-ak-mint', title: t('Mint an automation key'), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true,
    unsaved: { isDirty: () => !!name.value.trim() || boxes.some((b) => b.checked), save: () => doMint(), saveLabel: t('Mint'), discard: () => { name.value = ''; for (const b of boxes) b.checked = false; } }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const name = el('input', 'vw-ak-name');
  name.type = 'text'; name.maxLength = 60; name.placeholder = t('Name'); name.setAttribute('aria-label', t('Name')); name.spellcheck = false;
  body.append(name, el('div', 'vw-ak-sec', t('What it may do')));
  const { node: verbs, boxes } = verbPicks([]);
  body.append(verbs);
  // the limits — shown while 开一个对话 is ticked (absent, never greyed, otherwise)
  const ed = limitsEditor(null, data, ((data && data.limitChoices) || {}).permissionNow || null);   // q-049 M2: a fresh key — the hub's own folder
  const limWrap = el('div', 'vw-ak-limwrap');
  limWrap.append(el('div', 'vw-ak-sec', t('What the conversations it opens may use')), ed.node);
  body.append(limWrap);
  limitsFollowOpen(boxes, limWrap);
  body.append(el('div', 'vw-ak-hint', t('The key\'s value is sealed in the vault — nobody sees it. Grant it to a conversation or a task group next.')));
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const mint = el('button', 'btn-create vw-ak-mint-go', t('Mint'));
  cancel.type = mint.type = 'button';
  cancel.onclick = () => close();
  const doMint = async () => {
    const scopes = boxes.filter((b) => b.checked).map((b) => b.value);
    const r = await post('/api/automation/keys', { name: name.value, scopes, ...(scopes.includes(OPEN_VERB) ? { limits: ed.value() } : {}) });
    if (!r || !r.ok) { showToast(failWords(r), { type: 'error' }); return false; }
    showToast(t('Minted — its value stays sealed in the vault'));
    close();
    refresh?.();
    return true;
  };
  mint.onclick = () => { doMint(); };
  f.append(cancel, mint);
  body.parentNode.append(f);
  setTimeout(() => name.focus(), 0);
}
