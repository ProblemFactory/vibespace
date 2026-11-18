// THE VAULT'S FILE ROW (lane lg-vault-file, B-0830 — design q-058 §1; the owner 2026-11-02: 「general 文件种类，这样什么 ssh key，
// 某些应用的授权文件啥的都能存进去了」): a FILE entry's facts on its row (its file's name, its size, its kind, a passphrase it
// needs), the owner's DOWNLOAD behind 验证是你 (the bytes go to the browser's own save — never drawn on the page), and
// 添加 › 文件… (pick or drop ONE file; its size is checked BEFORE it is read; then POST /api/vault/files). Every word a person
// reads goes through t(); every text lands by textContent. Nothing here keeps a byte past the press that read it.
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { revealValue, revealWords } from './vault-reveal.js';
import { wordsRefusalWords } from './vault-paste-box.js';   // the name / description rule's refusals in their own words
import { FILE_MAX } from '../vault-file.js';   // THE cap (the owner's D1, 2026-11-03) — the page refuses a bigger file before reading a byte of it

const FILE_MIN = 8;   // = src/vault-file.js fileVerdict's floor (a shorter file cannot be masked in a run's output)
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (label, cls) => { const b = mk('button', cls, label); b.type = 'button'; return b; };

/** A size in a person's words. */
function sizeWords(n) {
  const b = Math.max(0, Math.floor(Number(n) || 0));
  if (b < 1024) return t('{n} bytes', { n: b });
  if (b < 1024 * 1024) return t('{n} KB', { n: Math.round(b / 102.4) / 10 });
  return t('{n} MB', { n: Math.round(b / 104857.6) / 10 });
}
const KIND_WORDS = { 'ssh-key': () => t('SSH key'), pem: () => t('Certificate or PEM'), generic: () => t('File') };
const fileKindWord = (k) => (KIND_WORDS[k] || KIND_WORDS.generic)();

/** A file row's extras: `box` = its file line (name · size · kind), `chips` = the passphrase state, `doors` = Download. */
export function fileExtras(row) {
  const f = row && row.file;
  if (!f) return { box: null, chips: [], doors: [] };
  const box = mk('div', 'vw-file');
  box.append(mk('span', 'vw-file-name', f.name), mk('span', 'vw-file-meta', `${sizeWords(f.size)} · ${fileKindWord(f.kind)}`));
  const chips = [];
  if (f.encrypted) {
    const c = mk('span', 'vw-chip vw-chip-state vw-file-pass', t('Needs its passphrase'));
    c.dataset.state = 'encrypted';
    c.title = t('A private key protected by its passphrase, stored as it is — a command run with it needs that passphrase, and VibeSpace never types it');
    chips.push(c);
  }
  const dl = btn(t('Download'), 'vw-btn vw-file-download');   // the window's own door style (src/lib/vault-window.js btnEl)
  dl.title = t('Save the file on this device — asks for the second password; the file is never shown on the page');
  dl.onclick = () => downloadFile(row, dl);
  return { box, chips, doors: [dl] };
}

/** base64 → bytes (the browser's own decoder). */
function bytesOf(b64) { const s = atob(String(b64 || '')); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
/** THE DOWNLOAD: the reveal door (验证是你 first when this page has no window) answers the file once; the browser saves it. */
async function downloadFile(row, b = null) {
  if (b) b.disabled = true;
  try {
    const r = await revealValue(row.id);
    if (!r || !r.ok) { if (r && r.code !== 'cancelled') showToast(revealWords(r), { type: 'error' }); return false; }
    if (typeof r.bytes !== 'string') { showToast(t('That stored value could not be opened'), { type: 'error' }); return false; }
    const bytes = bytesOf(r.bytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = mk('a');
    a.href = url; a.download = (r.file && r.file.name) || (row.file && row.file.name) || 'file'; a.hidden = true;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    bytes.fill(0);
    showToast(t('Downloading {name}…', { name: a.download }));   // the browser saves it (it may ask where, or the person may cancel) — never «saved» before it is
    return true;
  } finally { if (b) b.disabled = false; }
}

/** A file's refusal in a person's words. */
function fileRefusalWords(code) {
  if (code === 'file_too_large') return t('The vault keeps files up to 1 MB — this one is bigger');
  if (code === 'file_empty') return t('That file is empty');
  if (code === 'file_too_small') return t('A file under 8 bytes cannot be kept as a file — add it as a key or password instead');
  if (code === 'file_name_bad') return t('That file\'s name cannot be used — rename the file and choose it again');
  if (code === 'file_one') return t('Choose one file at a time');
  if (code === 'file_folder') return t('A folder cannot be kept — choose one file');
  if (code === 'bytes_bad') return t('The file did not arrive whole — pick it again');
  if (code === 'vault_locked') return t('The vault is locked (vault_locked) — unlock it, then save');
  if (code === 'name_required') return t('Give it a name');
  if (code === 'note_too_long' || code === 'name_too_long') return t('Shorten its name or description');
  if (code === 'note_secret' || code === 'name_secret' || code === 'hidden_chars' || code === 'note_lines' || code === 'name_lines') return wordsRefusalWords(code);   // the words rule's own refusals
  return t('The file could not be saved ({code})', { code: String(code || 'error') });
}

/** THE FILE BOX — pick (or drop) ONE file: its size checked before it is read, then read as bytes. `onPick({ name, size, b64 })`
 *  | `onPick(null)` (cleared); `onError(words)`. The bytes live in the caller's closure only until it sends them. */
function filePickEl({ onPick = () => {}, onError = () => {} } = {}) {
  const zone = mk('div', 'vault-file-drop');
  const input = mk('input', 'vault-file-input'); input.type = 'file';
  const choose = btn(t('Choose a file…'), 'btn-cancel vault-file-choose');
  const label = mk('span', 'vault-file-picked', t('or drop it here'));
  zone.append(choose, label, input);
  input.hidden = true;
  choose.onclick = () => input.click();
  // ONE file, never a folder; the event stops HERE — a drop on this box must never reach a surface below it (the chat window's
  // own drop uploads a file into the agent's working folder: adversarial read r1 of U2, a BLOCKER)
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const take = (file, { items = null, count = 1 } = {}) => {
    if (count > 1) { onPick(null); onError(fileRefusalWords('file_one')); return; }
    const entry = items && items[0] && typeof items[0].webkitGetAsEntry === 'function' ? items[0].webkitGetAsEntry() : null;
    if (entry && entry.isDirectory) { onPick(null); onError(fileRefusalWords('file_folder')); return; }
    if (!file) return;
    if (file.size > FILE_MAX) { onPick(null); label.textContent = t('or drop it here'); onError(fileRefusalWords('file_too_large')); return; }
    if (file.size < FILE_MIN) { onPick(null); label.textContent = t('or drop it here'); onError(fileRefusalWords(file.size ? 'file_too_small' : 'file_empty')); return; }
    const rd = new FileReader();
    rd.onerror = () => onError(t('That file could not be read'));
    rd.onload = () => {
      const u8 = new Uint8Array(rd.result);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      u8.fill(0);
      label.textContent = `${file.name} · ${sizeWords(file.size)}`;
      onError('');
      onPick({ name: file.name, size: file.size, b64: btoa(s) });
    };
    rd.readAsArrayBuffer(file);
  };
  input.onchange = () => take(input.files && input.files[0]);
  zone.addEventListener('dragenter', stop);
  zone.addEventListener('dragover', (e) => { stop(e); zone.classList.add('vault-file-over'); });
  zone.addEventListener('dragleave', (e) => { e.stopPropagation(); zone.classList.remove('vault-file-over'); });
  zone.addEventListener('drop', (e) => { stop(e); zone.classList.remove('vault-file-over'); const dt = e.dataTransfer || {}; const fl = dt.files || []; take(fl[0], { items: dt.items || null, count: fl.length || 0 }); });
  return { el: zone, clear: () => { input.value = ''; label.textContent = t('or drop it here'); onPick(null); } };
}

/** 添加 › 文件… — the owner's FILE: the file, a name (default: the file's name without its extension), a description →
 *  POST /api/vault/files (a person on this page; unlocked only). `refresh()` redraws the window's list on success. */
export function showFileAddDialog({ refresh = () => {} } = {}) {
  let saveNow = () => {};
  let picked = null;
  // one subject: one file being added (the 文件… door)
  const { dialog, body, close, raised } = createModalShell({ id: 'vault-file-add', title: t('Add a file'), dialogClass: 'vault-file-add-dialog', escapeToClose: true,
    unsaved: { isDirty: () => !!(picked || name.value || note.value), save: () => saveNow(), discard: () => { picked = null; } }, kind: 'form' });
  if (raised) return null;
  const field = (label, control) => { const l = mk('label', 'vault-secret-field'); l.append(mk('span', 'vault-secret-label', label), control); return l; };
  const err = mk('div', 'vault-secret-error'); err.setAttribute('role', 'status');
  const name = mk('input', 'vault-pw vault-secret-name'); name.type = 'text'; name.maxLength = 80; name.autocomplete = 'off'; name.placeholder = t('What it is — e.g. Deploy key for the build server');
  const note = mk('textarea', 'vault-pw vault-secret-note'); note.rows = 2; note.maxLength = 400; note.placeholder = t('What it is for — which system, which account, what it may do (agents that may use it read this)');
  const pick = filePickEl({ onPick: (p) => { picked = p; if (p && !name.value) name.placeholder = p.name.replace(/\.[^.]{1,12}$/, '') || p.name; }, onError: (w) => { err.textContent = w; } });
  const help = mk('div', 'vault-words-help', t('An SSH key, a certificate, a kubeconfig, a licence file — up to 1 MB. A command an agent runs gets it as a private file for that run; nobody sees its contents on a page.'));
  const foot = mk('div', 'dialog-footer');
  const cancel = btn(t('Cancel'), 'btn-cancel');
  const save = btn(t('Save to vault'), 'btn-create');
  foot.append(cancel, save);
  body.append(help, field(t('File'), pick.el), field(t('Name'), name), field(t('Description'), note), err);
  dialog.append(foot);
  cancel.onclick = () => { picked = null; close(); };
  save.onclick = saveNow = async () => {
    if (!picked) { err.textContent = t('Choose a file first'); return; }
    save.disabled = true;
    const r = await fetchJson('/api/vault/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: name.value, note: note.value.replace(/\s*[\r\n]+\s*/g, ' '), filename: picked.name, size: picked.size, bytes: picked.b64 }) });
    save.disabled = false;
    if (r && r.ok) {
      picked = null; close();
      showToast(r.encrypted ? t('Saved to the vault: {name} — it needs its passphrase, which a command run with it must have (VibeSpace never types it)', { name: r.label || name.value }) : t('Saved to the vault: {name}', { name: r.label || name.value }));
      try { refresh(); } catch { }
      return;
    }
    err.textContent = fileRefusalWords(r && r.code);
  };
  return { dialog, close };
}
