// TWO-STEP CODES IN THE VAULT WINDOW (design q-047 L1, lane vault-totp — the hub's half: src/server/vault-totp.js over PURE
// src/totp.js). A two-step entry's row (kind 'totp') gets:
//   · 「看码」 → its CURRENT code, the ring of the seconds left and the seconds (GET /api/vault/totp/:name — a person's door with
//     no 「验证是你」: a code dies in seconds, the seed is the secret; every view is a line in the vault's audit). The code is
//     asked again only at its step's boundary, only while this page is visible, at most 10 times (≈ 5 minutes) — then it
//     hides; 「复制」 copies the code (cleared from the clipboard after 30 s when the page can);
//   · 「用于…」 grants the CODE — never the seed — to running conversations and Task Groups (POST /api/vault/totp/:name/grants);
//     the chips list the grants, ✕ takes one back; a conversation's grant ends with that conversation (「已结束」).
// The seed and its settings are the row's own 「显示」 (the window's reveal door — the second password again): its help says so.
import { t } from './i18n.js';
import { fetchJson, showToast, copyText, createModalShell } from './utils.js';
import { CLIPBOARD_CLEAR_MS } from '../vault-inventory.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const failWords = (r) => t('Not done — {reason}', { reason: (r && (r.error || r.code)) || t('server unreachable') });
const post = (url, body = {}) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const AUTO_MAX = 10;   // automatic re-asks after 看码 (one per step) — then the code hides
const grouped = (c) => { const s = String(c || ''); return s.length === 6 ? `${s.slice(0, 3)} ${s.slice(3)}` : s.length === 8 ? `${s.slice(0, 4)} ${s.slice(4)}` : s; };

/** The window's two-step facts: every entry's grants + the picker's subjects (never a value). */
export async function loadTotp() {
  const r = await fetchJson('/api/vault/totp');
  return r && r.ok ? r : null;
}
function subjectName(subject, data) {
  const all = [...((data && data.subjects && data.subjects.sessions) || []), ...((data && data.subjects && data.subjects.groups) || [])];
  const hit = all.find((s) => s.subject === subject);
  return hit ? hit.name : String(subject).replace(/^session:/, '').replace(/^group:/, t('Task group') + ' ');
}

/** A two-step row's extras: `value` (看码 · the code · 复制) for the value column, `box` (the grant chips) for the main
 *  column, `doors` (用于…), `stop()` (the window rebuilt / closed / locked). `show` = the row's 显示 (its help is set here). */
export function totpExtras(row, data, { refresh, signal, show } = {}) {
  const name = String(row.entry || '').replace(/^totp:/, '');
  const entry = ((data && data.entries) || []).find((e) => e.name === name) || { name, grants: [] };
  if (show) show.title = t('Shows the seed and its settings (an otpauth link) — after the second password');
  const viewB = el('button', 'vw-btn vw-code-view', t('View code'));
  viewB.type = 'button';
  viewB.title = t('The current two-step code — no second password; every view is in the vault\'s audit');
  const code = el('span', 'vw-code');
  const ring = el('span', 'vw-ring');
  const digits = el('span', 'vw-code-digits');
  const left = el('span', 'vw-code-left');
  code.append(ring, digits, left);
  code.hidden = true;
  const copyB = el('button', 'vw-btn vw-code-copy', t('Copy'));
  copyB.type = 'button';
  copyB.hidden = true;
  const st = { on: false, code: '', until: 0, period: 30, tick: null, auto: 0, busy: false };

  function draw() {
    const secs = Math.max(0, Math.ceil((st.until - Date.now()) / 1000));
    if (digits.textContent !== grouped(st.code)) digits.textContent = grouped(st.code);
    left.textContent = t('{s} s', { s: secs });
    ring.style.setProperty('--p', `${Math.round((Math.min(secs, st.period) / st.period) * 100)}%`);
    return secs;
  }
  function stop() {
    st.on = false; st.code = ''; st.auto = 0;
    clearInterval(st.tick); st.tick = null;
    digits.textContent = ''; code.hidden = true; copyB.hidden = true;
    viewB.textContent = t('View code');
  }
  async function ask() {
    if (st.busy) return;
    st.busy = true;
    const r = await fetchJson(`/api/vault/totp/${encodeURIComponent(name)}`).catch(() => null);
    st.busy = false;
    if (!st.on || (signal && signal.aborted)) return;
    if (!r || r.ok === false || typeof r.code !== 'string') {
      stop();
      if (r && r.code === 'vault_locked') { refresh?.(); return; }
      showToast(failWords(r), { type: 'error' });
      return;
    }
    st.code = r.code; st.period = Number(r.period) || 30; st.until = Date.now() + (Number(r.secondsLeft) || 0) * 1000;
    code.hidden = false; copyB.hidden = false;
    draw();
  }
  function start() {
    st.on = true; st.auto = 0;
    viewB.textContent = t('Hide code');
    ask();
    st.tick = setInterval(() => {
      if (!st.on || st.busy || !st.code) return;
      if (draw() > 0) return;
      // the step is over: ask again — only while this page is visible, and not past the cap
      if (document.visibilityState !== 'visible' || st.auto >= AUTO_MAX) { stop(); return; }
      st.auto++;
      ask();
    }, 1000);
  }
  viewB.onclick = () => (st.on ? stop() : start());
  copyB.onclick = async () => {
    const v = st.code;
    if (!v) return;
    await copyText(v);
    showToast(t('Copied — cleared from the clipboard in 30 s if this tab stays open'));
    setTimeout(async () => {
      try { if ((await navigator.clipboard.readText()) !== v) return; } catch { /* cannot read it back: clear anyway */ }
      try { await navigator.clipboard.writeText(''); } catch { /* the page is not focused — nothing more it can do */ }
    }, CLIPBOARD_CLEAR_MS);
  };
  signal?.addEventListener('abort', stop, { once: true });

  // 用于…: the grants (chips, ✕ takes one back) and the picker
  const box = el('div', 'vw-ak vw-totp');
  box.dataset.totp = name;
  const grants = el('div', 'vw-ak-grants');
  if (entry.grants.length) {
    grants.append(el('span', 'vw-ak-to', t('Code granted to:')));
    for (const g of entry.grants) {
      const chip = el('span', 'vw-ak-chip');
      chip.dataset.subject = g.subject;
      chip.append(el('span', null, subjectName(g.subject, data) + (g.live === false ? ` (${t('ended')})` : '')));
      const x = el('button', 'vw-ak-x', '✕');
      x.type = 'button'; x.title = t('Take this grant back'); x.setAttribute('aria-label', x.title);
      x.onclick = async () => { const r = await fetchJson(`/api/vault/totp/grants/${encodeURIComponent(g.id)}`, { method: 'DELETE' }); if (!r || !r.ok) showToast(failWords(r), { type: 'error' }); refresh?.(); };
      chip.append(x);
      grants.append(chip);
    }
    box.append(grants);
  }
  const useB = el('button', 'vw-btn vw-totp-grant', t('Use for…'));
  useB.type = 'button';
  useB.title = t('Grant the current code (never the seed) to a running conversation or a task group');
  useB.onclick = () => showTotpGrantPicker(entry, data, { refresh });
  return { value: [viewB, code, copyB], box, doors: [useB], stop };
}

/** 用于…: every running conversation and Task Group, multi-select; checked = granted (a conversation's grant from an earlier
 *  run counts as not granted); unchecking takes a grant back. */
export function showTotpGrantPicker(entry, data, { refresh } = {}) {
  // lane dialog-unsaved-guard: a tick changed and not saved ⇒ ✕ / Esc / the backdrop asks
  const { body, close } = createModalShell({ id: 'vault-totp-grant', title: t('Grant the code of "{name}" to', { name: entry.name }), dialogClass: 'vault-dialog-box vw-ak-dialog', escapeToClose: true,
    unsaved: { isDirty: () => boxes.some((b) => b.checked !== had.has(b.value)), save: () => doSave() } });
  const subjects = (data && data.subjects) || { sessions: [], groups: [] };
  const had = new Map(entry.grants.filter((g) => g.live !== false).map((g) => [g.subject, g.id]));
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
  body.append(el('div', 'vw-ak-hint', t('A conversation granted the code gets the current code (vibespace-vault totp) — never the seed. A conversation\'s grant ends when that conversation ends.')));
  const f = el('div', 'dialog-footer');
  const cancel = el('button', 'btn-cancel', t('Cancel'));
  const save = el('button', 'btn-create vw-totp-save', t('Save'));
  cancel.type = save.type = 'button';
  cancel.onclick = () => close();
  const doSave = async () => {
    const add = boxes.filter((b) => b.checked && !had.has(b.value)).map((b) => b.value);
    const drop = boxes.filter((b) => !b.checked && had.has(b.value)).map((b) => had.get(b.value));
    let bad = null;
    if (add.length) { const r = await post(`/api/vault/totp/${encodeURIComponent(entry.name)}/grants`, { subjects: add }); if (!r || !r.ok) bad = r || {}; }
    for (const gid of drop) { const r = await fetchJson(`/api/vault/totp/grants/${encodeURIComponent(gid)}`, { method: 'DELETE' }); if (!r || !r.ok) bad = r || {}; }
    if (bad) showToast(failWords(bad), { type: 'error' }); else showToast(t('Saved'));
    close();
    refresh?.();
    return true;
  };
  save.onclick = () => { doSave(); };
  f.append(cancel, save);
  body.parentNode.append(f);
}
