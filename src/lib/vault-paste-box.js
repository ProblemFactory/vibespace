// THE PASTE BOX (lane vault-paste-request — the owner 2026-10-23: 「应该允许你给我弹一个保险库输入框让我直接 paste 进去，省得我还
// 得手动去保险库搞」). An agent's request for a secret (the For-you action `secret-request`, src/server/vault-paste-door.js) is
// answered where it appears: a MASKED field (a password input — a phone keyboard's paste works, nothing autocompletes, no
// password manager offers or keeps it), 「存入保险库」 and 「拒绝」. The tray row draws it INLINE (src/lib/user-todos-row.js
// keeps the box across every repaint, as it keeps a reply box); the For-you window and the Vault window's 「需要你」 open the
// same box as a dialog. The value goes in through `.value` only, rides ONE POST body to the owner's cookie door
// (POST /api/vault/secret-requests/:id/answer) and leaves the field the moment the answer lands — never a toast, a log line, an
// attribute or text. A LOCKED vault is said by name with 解锁… inline (THE unlock dialog); a vault not set up with
// 设置第二密码… (a free entry needs it; an Integrations field does not).
// Also 「其他密钥或密码…」 (the Vault window's 添加 menu — the owner the same morning: 「我压根没法添加啊」): a FREE entry the owner
// adds — a name, a kind, the value (the same masked field), a note — POST /api/vault/secrets.
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { vaultFacts, showUnlock, showSetup } from './vault-unlock.js';

export const SECRET_ACTION = 'secret-request';
/** Is this For-you item an agent's request for a secret (still answerable — it names its request)? */
export const isSecretAsk = (i) => !!(i && i.action && i.action.type === SECRET_ACTION && /^sr-[0-9a-f]{12}$/.test(String(i.action.requestId || '')));
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (label, cls) => { const b = mk('button', cls, label); b.type = 'button'; return b; };

/** THE MASKED FIELD — the vault dialogs' own field (class vault-pw): a password input that never autocompletes, never
 *  spell-checks, is never offered to a password manager; Enter is «done». */
export function secretInput(placeholder) {
  const i = mk('input', 'vault-pw vault-secret-input');
  i.type = 'password'; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = placeholder;
  i.setAttribute('aria-label', placeholder);
  for (const [k, v] of [['autocapitalize', 'off'], ['autocorrect', 'off'], ['enterkeyhint', 'done'], ['data-lpignore', 'true'], ['data-1p-ignore', 'true'], ['data-bwignore', 'true'], ['data-form-type', 'other']]) i.setAttribute(k, v);
  return i;
}

/** lane vault-entry-description: a refusal of an entry's WORDS (its name, its description) → what the page says. */
export function wordsRefusalWords(code, r) {
  if (code === 'name_required') return t('Give it a name');
  if (code === 'name_too_long') return t('The name is at most 80 characters');
  if (code === 'note_too_long') return t('The description is at most 400 characters');
  if (code === 'note_lines') return t('The description is one paragraph — no line breaks');
  if (code === 'note_secret' || code === 'name_secret') return t('A name or a description may not contain a secret — say what it is for, never its value');
  if (code === 'hidden_chars') return t('It holds a hidden or direction character — type it again');
  if (code === 'vault_locked') return t('The vault is locked (vault_locked) — unlock it, then save');
  if (code === 'words_not_here') return t('This kind of entry has no name or description of its own');
  return (r && r.error) || t('server unreachable');
}
/** The proposed words of a NEW entry, read back from the request's own lines (the item is the record — src/vault-paste.js cardOf). */
const lineParam = (item, key, name) => { const l = ((item && item.i18n && Array.isArray(item.i18n.detail)) ? item.i18n.detail : []).find((x) => x && x.key === key); const v = l && l.params && l.params[name]; return typeof v === 'string' ? v : ''; };
const ENTRY_KEY = 'Where it goes: a new vault entry «{label}» ({kind})', NOTE_KEY = 'Its description, in the agent\'s words: {note}';

/** THE BOX for one request (DOM nodes — every word textContent): the field + 存入保险库 + 拒绝, and its state line below
 *  (the vault locked / not set up — each with its door — or the last refusal's words). lane vault-entry-description: a NEW
 *  entry's name and description as the agent proposed them, above the field — the owner's to edit before he saves (his win). */
export function secretBoxEl(item) {
  const box = mk('div', 'ut-secret');
  box.dataset.req = String(item.action.requestId);
  box.dataset.target = item.action.into ? 'field' : 'entry';
  if (box.dataset.target === 'entry') {
    const meta = mk('div', 'ut-secret-meta');
    const name = mk('input', 'vault-pw ut-secret-name'); name.type = 'text'; name.maxLength = 80; name.autocomplete = 'off'; name.spellcheck = false; name.value = lineParam(item, ENTRY_KEY, 'label'); name.setAttribute('aria-label', t('Name'));
    const desc = mk('textarea', 'vault-pw ut-secret-desc'); desc.rows = 2; desc.maxLength = 400; desc.value = lineParam(item, NOTE_KEY, 'note'); desc.setAttribute('aria-label', t('Description'));
    desc.placeholder = t('What it is for — which system, which account, what it may do (agents that may use it read this)');
    const lab = (w, c) => { const l = mk('label', 'ut-secret-field'); l.append(mk('span', 'ut-secret-label', w), c); return l; };
    meta.append(lab(t('Name'), name), lab(t('Description'), desc));
    box.append(meta);
  }
  const row = mk('div', 'ut-secret-row');
  const input = secretInput(t('Paste it here'));
  input.classList.add('ut-secret-input');
  const save = btn(t('Save to vault'), 'ut-act ut-secret-save');
  const deny = btn(t('Refuse'), 'ut-act ut-secret-deny');
  row.append(input, save, deny);
  // lane wake-approve-card r3 (主开发: a FORM card — «wrong label — ask again»): the request names a place the AGENT chose; a wrong
  // one is refused here and the agent asks again with the right one (the refusal reaches it on its next turn)
  const note = mk('div', 'ut-secret-note', t('Wrong name or kind? Refuse — the agent can ask again with the right one.'));
  const state = mk('div', 'ut-secret-state');
  state.setAttribute('role', 'status');
  const words = mk('span', 'ut-secret-words');
  const unlock = btn(t('Unlock…'), 'ut-secret-unlock');
  const setup = btn(t('Set a second password…'), 'ut-secret-setup');
  state.append(words, unlock, setup);
  box.append(row, note, state);
  applySecretBox(box);
  return box;
}

/** The box's state from the vault's facts (vault-unlock.js — kept live by the `vault-state` broadcast): LOCKED ⇒ the words
 *  + 解锁…; NOT SET UP and a new entry ⇒ the words + 设置第二密码…; else the last refusal (`error`) or nothing. */
export function applySecretBox(box, { error } = {}) {
  if (!box) return;
  if (error !== undefined) box.dataset.error = error || '';
  const f = vaultFacts() || {}, st = f.state || '';
  const entry = box.dataset.target === 'entry';
  const locked = st === 'locked', notSetUp = st === 'not_set_up' && entry;
  const say = locked ? t('The vault is locked (vault_locked) — unlock it, then save') : notSetUp ? t('The vault is not set up yet — set its second password, then save') : (box.dataset.error || '');
  const words = box.querySelector(':scope > .ut-secret-state > .ut-secret-words');
  if (words && words.textContent !== say) words.textContent = say;
  const unlock = box.querySelector(':scope > .ut-secret-state > .ut-secret-unlock'), setup = box.querySelector(':scope > .ut-secret-state > .ut-secret-setup');
  if (unlock) unlock.style.display = locked ? '' : 'none';
  if (setup) setup.style.display = notSetUp ? '' : 'none';
  const state = box.querySelector(':scope > .ut-secret-state');
  if (state) state.style.display = say ? '' : 'none';
  box.dataset.state = locked ? 'locked' : notSetUp ? 'not_set_up' : 'ready';
}

/** A refusal's code → the words the box says (never the value — the server's own words name the rule). */
function refusalSay(code, r) {
  if (code === 'vault_locked') return t('The vault is locked (vault_locked) — unlock it, then save');
  if (code === 'vault_not_set_up') return t('The vault is not set up yet — set its second password, then save');
  if (code === 'invalid_value') return t('Not saved — {why}', { why: r && r.why ? t(String(r.why)) : t('the field does not accept that value') });
  if (code === 'value_required') return t('Paste it first');
  if (code === 'value_too_long') return t('That is too long to be a secret (at most 8192 characters)');
  if (code === 'ask_settled') return t('Already answered');
  if (code === 'ask_unknown') return t('That request is gone');
  return wordsRefusalWords(code, r);   // lane vault-entry-description: the name / description the owner edited
}

/** THE PRESS (the tray's box, the dialog's): 存入保险库 sends the field's value through the model's ONE verb (the cookie
 *  door) and clears the field the moment it is stored; 拒绝 refuses (the field is cleared too). A refusal is said in the
 *  box (and a toast), the value kept in the field so the owner can unlock and press again. → true when answered. */
export async function submitSecretBox(model, item, box, answer) {
  if (!model || !item || !box || box.dataset.busy === '1') return false;
  const input = box.querySelector('input.ut-secret-input');
  const value = answer === 'store' && input ? input.value : null;
  const nameEl = box.querySelector('input.ut-secret-name'), descEl = box.querySelector('textarea.ut-secret-desc');   // lane vault-entry-description: the owner's words (a new entry only)
  const words = answer === 'store' && nameEl ? { name: nameEl.value, note: descEl ? descEl.value.replace(/\s*[\r\n]+\s*/g, ' ') : undefined } : {};
  if (answer === 'store' && !String(value || '').trim()) { applySecretBox(box, { error: t('Paste it first') }); if (input) input.focus(); return false; }
  box.dataset.busy = '1';
  box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  let done = false;
  try {
    done = await model.runAction(item, answer, { value, ...words, onRefusal: (code, r) => applySecretBox(box, { error: refusalSay(code, r) }) });
  } finally {
    delete box.dataset.busy;
    box.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
  if (done && input) input.value = '';
  if (answer === 'deny' && input) input.value = '';
  return !!done;
}

/** The answer's toast + the box's refusal (the model's runAction hands the refusal back through `onRefusal`). */
export async function postSecretAnswer(item, answer, { value = null, name, note, onRefusal = null } = {}) {
  const body = answer === 'store' ? { answer, value, ...(typeof name === 'string' ? { name } : {}), ...(typeof note === 'string' ? { note } : {}) } : { answer };   // name / note: lane vault-entry-description
  const r = await fetchJson(`/api/vault/secret-requests/${encodeURIComponent(item.action.requestId)}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r && r.ok) { showToast(r.outcome === 'stored' ? t('Saved to the vault — the agent is told it is there, never the value') : t('Refused — the agent is told on its next turn')); return true; }
  const code = r && r.code;
  if (typeof onRefusal === 'function') { try { onRefusal(code, r); } catch { } }
  showToast(refusalSay(code, r), { type: 'error' });
  return false;
}

/** THE SAME BOX AS A DIALOG (the For-you window's pane, the Vault window's 「需要你」): the request's words above the box. */
export function showSecretPasteDialog(model, item, { words = '', detail = '' } = {}) {
  if (!isSecretAsk(item)) return null;
  const box = secretBoxEl(item);
  const press = async (answer) => { if (await submitSecretBox(model, item, box, answer)) close(); };
  const fieldOf = () => box.querySelector('input.ut-secret-input');
  const { dialog, body, close, raised } = createModalShell({ id: 'vault-paste-dialog', key: item && item.id, beside: true, title: t('Paste a secret into the vault'), dialogClass: 'vault-paste-dialog', escapeToClose: true,
    unsaved: { isDirty: () => !!(fieldOf() && fieldOf().value), save: () => press('store'), discard: () => { const f = fieldOf(); if (f) f.value = ''; } }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was   // a pasted value never vanishes without a word — nor stays in a closed dialog
  body.append(mk('div', 'vault-paste-words', words), mk('div', 'ut-proposal-plan vault-paste-plan', detail), box);
  box.addEventListener('click', (e) => {
    if (e.target.closest('.ut-secret-unlock')) { showUnlock({ then: () => applySecretBox(box) }); return; }
    if (e.target.closest('.ut-secret-setup')) { showSetup(); return; }
    if (e.target.closest('.ut-secret-save')) press('store');
    else if (e.target.closest('.ut-secret-deny')) press('deny');
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && e.target.matches('input.ut-secret-input')) { e.preventDefault(); press('store'); } });
  const input = fieldOf();
  if (input) setTimeout(() => input.focus(), 0);
  return { dialog, close, box };
}

/** lane vault-entry-description: Edit… — the OWNER's own name and description of an entry (a row of a kind that carries words):
 *  the ONE writer (POST /api/vault/entry-words — a person on this page), no card. `refresh()` redraws the window's list. */
export function showWordsEditDialog({ row, refresh = () => {} } = {}) {
  if (!row || !row.entry) return null;
  let saveNow = () => {};
  const name = mk('input', 'vault-pw vault-words-name'); name.type = 'text'; name.maxLength = 80; name.autocomplete = 'off'; name.value = String(row.label || '');
  const note = mk('textarea', 'vault-pw vault-words-note'); note.rows = 3; note.maxLength = 400; note.value = String(row.note || ''); note.placeholder = t('What it is for — which system, which account, what it may do');
  // one subject: one entry's words
  const { dialog, body, close, raised, ready } = createModalShell({ id: 'vault-words-edit', key: row.id, title: t('Name and description'), dialogClass: 'vault-secret-add-dialog vault-words-dialog', escapeToClose: true,
    unsaved: { isDirty: () => name.value !== String(row.label || '') || note.value !== String(row.note || ''), save: () => saveNow(), discard: () => {} }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const field = (label, control) => { const l = mk('label', 'vault-secret-field'); l.append(mk('span', 'vault-secret-label', label), control); return l; };
  const err = mk('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  const foot = mk('div', 'dialog-footer');
  const cancel = btn(t('Cancel'), 'btn-cancel'), save = btn(t('Save'), 'btn-create');
  foot.append(cancel, save);
  body.append(mk('div', 'vault-words-help', t('Every agent that may use it reads its name and description in its list — say what it is for, never the secret itself.')), field(t('Name'), name), field(t('Description'), note), err);
  dialog.append(foot);
  cancel.onclick = () => close();
  save.onclick = saveNow = async () => {
    save.disabled = true;
    const r = await fetchJson('/api/vault/entry-words', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry: row.entry, name: name.value, note: note.value.replace(/\s*[\r\n]+\s*/g, ' ') }) });   // one paragraph: a line break folds
    save.disabled = false;
    if (r && r.ok) { close(); showToast(t('Saved: {name}', { name: r.name || name.value })); try { refresh(); } catch { } return; }
    err.textContent = wordsRefusalWords(r && r.code, r);
  };
  ready.then((s) => { if (s) setTimeout(() => name.focus({ preventScroll: true }), 0); });   // once it opens (a keyed form may wait behind the open one's ask)
  return { dialog, close };
}

/** 「其他密钥或密码…」 — the Vault window's free entry: a name, a kind, the value (the masked field), a note → POST
 *  /api/vault/secrets (a person on this page; unlocked only). `refresh()` redraws the window's list on success. */
export function showSecretAddDialog({ refresh = () => {} } = {}) {
  let saveNow = () => {};
  // one subject: one key or password being added
  const { dialog, body, close, raised } = createModalShell({ id: 'vault-secret-add', title: t('Add another key or password'), dialogClass: 'vault-secret-add-dialog', escapeToClose: true,
    unsaved: { isDirty: () => !!(name.value || value.value || note.value), save: () => saveNow(), discard: () => { value.value = ''; } }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const field = (label, control) => { const l = mk('label', 'vault-secret-field'); l.append(mk('span', 'vault-secret-label', label), control); return l; };
  const name = mk('input', 'vault-pw vault-secret-name'); name.type = 'text'; name.maxLength = 80; name.autocomplete = 'off'; name.placeholder = t('What it is — e.g. Router admin password');
  const kind = mk('select', 'vault-secret-kind');
  for (const [v, w] of [['password', t('Password')], ['api-key', t('API key')], ['secret', t('Secret')]]) { const o = mk('option', null, w); o.value = v; kind.append(o); }
  const value = secretInput(t('Paste or type the value'));
  const note = mk('textarea', 'vault-pw vault-secret-note'); note.rows = 2; note.maxLength = 400; note.placeholder = t('What it is for — which system, which account, what it may do (agents that may use it read this)');   // lane vault-entry-description: was «a note for yourself — never shown to an agent»
  const err = mk('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  const foot = mk('div', 'dialog-footer');
  const cancel = btn(t('Cancel'), 'btn-cancel');
  const save = btn(t('Save to vault'), 'btn-create');
  foot.append(cancel, save);
  body.append(field(t('Name'), name), field(t('Kind'), kind), field(t('Value'), value), field(t('Description'), note), err);
  dialog.append(foot);
  cancel.onclick = () => { value.value = ''; close(); };
  save.onclick = saveNow = async () => {
    save.disabled = true;
    const r = await fetchJson('/api/vault/secrets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: name.value, kind: kind.value, note: note.value.replace(/\s*[\r\n]+\s*/g, ' '), value: value.value }) });   // one paragraph: a line break folds (lane vault-entry-description)
    save.disabled = false;
    if (r && r.ok) { value.value = ''; close(); showToast(t('Saved to the vault: {name}', { name: r.label || name.value })); try { refresh(); } catch { } return; }
    const code = r && r.code;
    err.textContent = code === 'name_required' ? t('Give it a name') : code === 'value_required' ? t('Paste or type the value') : code === 'vault_locked' ? t('The vault is locked (vault_locked) — unlock it, then save') : wordsRefusalWords(code, r);   // lane vault-entry-description: THE words rule's refusals
  };
  value.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); save.onclick(); } });
  setTimeout(() => name.focus(), 0);
  return { dialog, close };
}
