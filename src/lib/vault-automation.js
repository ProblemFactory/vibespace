// THE VAULT WINDOW'S «Automation keys» (design q-046 L1, lane automation-keys-core — the owner 2026-10-19: "之后相关可以用作自动化的
// API 都提供专门的 key 授权，存在 vault 里，内部 agent 可以被单项授权这个 key，全程不需要我看到 key"). VibeSpace's own keys: 铸造… (a name
// + the verbs it may do — the closed table), 授权给… (a multi-select picker of the live conversations and the Task Groups; a
// grant's chip ✕ takes it back), 撤销 (every grant stops, the value leaves the vault). The VALUE is never drawn here: the row's
// own 「显示」 (src/lib/vault-window.js, behind 验证是你) is the one road out, ONLY to hand to an outside party — the row says so.
// Every door is a person's (GET/POST /api/automation/… — an agent's token is refused human_only).
import { t } from './i18n.js';
import { fetchJson, showToast, showConfirmDialog, createModalShell } from './utils.js';
import { SCOPES } from '../automation-keys.js'; // PURE: the closed table of verbs (their words)

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const verbWord = (verb) => { const s = SCOPES.find((x) => x.verb === verb); return s ? t(s.label) : verb; };
const whenText = (ms) => (ms ? new Date(ms).toLocaleString() : '');
const failWords = (r) => t('Not done — {reason}', { reason: (r && (r.error || r.code)) || t('server unreachable') });
const post = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

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

/** The extras an «Automation keys» row carries: the verbs, the grants (chips with ✕), last used, and its doors. */
export function automationExtras(row, data, { refresh } = {}) {
  const id = String(row.entry || '').replace(/^apikey:/, '');
  const key = ((data && data.keys) || []).find((k) => k.id === id) || null;
  const box = el('div', 'vw-ak');
  box.dataset.key = id;
  if (!key) return { box, doors: [] };
  box.append(el('div', 'vw-ak-scopes', key.scopes.map(verbWord).join(' · ')));
  const grants = el('div', 'vw-ak-grants');
  if (!key.grants.length) grants.append(el('span', 'vw-ak-none', t('Not granted to anything yet')));
  else {
    grants.append(el('span', 'vw-ak-to', t('Granted to:')));
    for (const g of key.grants) {
      const chip = el('span', 'vw-ak-chip');
      chip.dataset.subject = g.subject;
      chip.append(el('span', null, subjectName(g.subject, data) + (g.mode === 'once' ? ` (${t('once')}${g.spentAt ? ', ' + t('used') : ''})` : '')));
      const x = el('button', 'vw-ak-x', '✕');
      x.type = 'button'; x.title = t('Take this grant back'); x.setAttribute('aria-label', x.title);
      x.onclick = async () => { const r = await fetchJson(`/api/automation/grants/${encodeURIComponent(g.id)}`, { method: 'DELETE' }); if (!r || !r.ok) showToast(failWords(r), { type: 'error' }); refresh?.(); };
      chip.append(x);
      grants.append(chip);
    }
  }
  box.append(grants);
  box.append(el('div', 'vw-ak-used', key.lastUsedAt ? t('Last used {when}', { when: whenText(key.lastUsedAt) }) : t('Never used')));
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
  return { box, doors: [grantB, revokeB] };
}

/** 授权给…: every live conversation and Task Group, multi-select; checked = granted (unchecking takes a grant back). */
export function showGrantPicker(key, data, { refresh } = {}) {
  const { body, close } = createModalShell({ id: 'vault-ak-grant', title: t('Grant "{name}" to', { name: key.name }), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true });
  const subjects = (data && data.subjects) || { sessions: [], groups: [] };
  const had = new Map(key.grants.filter((g) => g.mode === 'always').map((g) => [g.subject, g.id]));
  const boxes = [];
  const section = (title, list) => {
    if (!list.length) return;
    body.append(el('div', 'vw-ak-sec', title));
    for (const s of list) {
      const lab = el('label', 'vw-ak-pick');
      const cb = el('input');
      cb.type = 'checkbox'; cb.value = s.subject; cb.checked = had.has(s.subject);
      lab.append(cb, el('span', null, s.name));
      body.append(lab);
      boxes.push(cb);
    }
  };
  section(t('Conversations'), subjects.sessions || []);
  section(t('Task groups'), subjects.groups || []);
  if (!boxes.length) body.append(el('div', 'vw-empty', t('Nothing to pick: no conversation is running and there is no task group')));
  body.append(el('div', 'vw-ak-hint', t('A conversation granted the key uses it with its own session — it never sees the key\'s value.')));
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-ak-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  save.onclick = async () => {
    const add = boxes.filter((b) => b.checked && !had.has(b.value)).map((b) => b.value);
    const drop = boxes.filter((b) => !b.checked && had.has(b.value)).map((b) => had.get(b.value));
    let bad = null;
    if (add.length) { const r = await post(`/api/automation/keys/${encodeURIComponent(key.id)}/grants`, { subjects: add }); if (!r || !r.ok) bad = r || {}; }
    for (const gid of drop) { const r = await fetchJson(`/api/automation/grants/${encodeURIComponent(gid)}`, { method: 'DELETE' }); if (!r || !r.ok) bad = r || {}; }
    if (bad) showToast(failWords(bad), { type: 'error' }); else showToast(t('Saved'));
    close();
    refresh?.();
  };
  f.append(cancel, save);
  body.parentNode.append(f);
}

/** 铸造…: a name + the verbs it may do (the closed table; a billed verb says so). The value is sealed and never shown here. */
export function showMintDialog({ refresh } = {}) {
  const { body, close } = createModalShell({ id: 'vault-ak-mint', title: t('Mint an automation key'), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true });
  const name = el('input', 'vw-ak-name');
  name.type = 'text'; name.maxLength = 60; name.placeholder = t('Name'); name.setAttribute('aria-label', t('Name')); name.spellcheck = false;
  body.append(name, el('div', 'vw-ak-sec', t('What it may do')));
  const boxes = [];
  for (const s of SCOPES) {
    const lab = el('label', 'vw-ak-pick');
    const cb = el('input');
    cb.type = 'checkbox'; cb.value = s.verb;
    lab.append(cb, el('span', null, t(s.label) + (s.billed ? ' ' + t('(starts a billed turn)') : '')));
    body.append(lab);
    boxes.push(cb);
  }
  body.append(el('div', 'vw-ak-hint', t('The key\'s value is sealed in the vault — nobody sees it. Grant it to a conversation or a task group next.')));
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const mint = el('button', 'btn-create vw-ak-mint-go', t('Mint'));
  cancel.type = mint.type = 'button';
  cancel.onclick = () => close();
  mint.onclick = async () => {
    const r = await post('/api/automation/keys', { name: name.value, scopes: boxes.filter((b) => b.checked).map((b) => b.value) });
    if (!r || !r.ok) { showToast(failWords(r), { type: 'error' }); return; }
    showToast(t('Minted — its value stays sealed in the vault'));
    close();
    refresh?.();
  };
  f.append(cancel, mint);
  body.parentNode.append(f);
  setTimeout(() => name.focus(), 0);
}
