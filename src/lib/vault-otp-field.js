// THE TWO-STEP NAME FIELD's OWN LIST (lane vault-2fa-pick, 2026-11-17 — the owner: «只弹出了我截图里那个浏览器的推荐输入，没有
// vibespace自己的下拉框»). The field of the add door's fields (src/lib/vault-login-row.js loginFields: the Vault's 添加 ▸ 网站登录…
// dialog, the login card an agent's ask files — in the tray and in its own window) named the vault's two-step codes through
// the browser's NATIVE list (the tree's only <datalist>); every platform draws that list as its own suggestion popup, and the
// owner read it as the browser's history. Now THE PAGE draws the list:
//   · opened by the field's own mark (▾ at its right end) and by focus; headed in plain words; a row per code by its NAME (the
//     vault's own, unique — GET /api/vault/totp answers names);
//   · in the FLOW under the field (no dialog clips it; its rows are buttons, so the voice plugin's microphone keeps clear of
//     them — src/lib/voice-input.js KEEP_CLEAR — and re-places when the list opens: the box it lives in grew);
//   · keys (PURE src/lib/vault-otp-field-model.js keyStep): ↓ opens / moves, ↑ moves, Enter picks the highlighted row, Escape
//     closes the list and is TAKEN — heard at the window's capture, before the tray's and the form's own Escape — Tab leaves;
//     a composing key is never read; a press on a row keeps the focus in the field (no blur, nothing closes under it);
//   · the field still takes a typed name; one that names no code is said UNDER THE FIELD at once (the add door's own sentence),
//     not only at Save; a vault with none says so with the «Two-step code…» door (the caller's: the card moves its box first);
//   · the browser offers nothing of its own here: no `list`, autocomplete off, and the password managers' ignore marks.
// Only the list's rows are redrawn (on open and as the person types) — never the field, never the box it sits in.
import { t } from './i18n.js';
import { loadTotp } from './vault-totp-row.js';
import { entriesOf, listState, rowsOf, typedVerdict, keyStep } from './vault-otp-field-model.js';

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** The marks that keep the browser and the password managers off the field (no autofill, no history, no saved-login offer). */
export const NO_OFFER_ATTRS = Object.freeze([['autocomplete', 'off'], ['autocapitalize', 'off'], ['autocorrect', 'off'], ['data-lpignore', 'true'], ['data-1p-ignore', 'true'], ['data-bwignore', 'true'], ['data-form-type', 'other']]);
let seq = 0;
/** THE KEYS, heard FIRST: one window-capture keydown listener for every such field (a field → its handler). Window capture runs
 *  before every document-capture listener — the tray's own Escape (src/lib/user-todos-panel.js closes the whole sheet from
 *  there) — so a key the open list takes (Escape, ↑, ↓, Enter on a row) reaches nobody else; a key it does not take goes on
 *  as before. (Not the [data-popover] mark: the app, the phone's back press and the taskbar REMOVE every such node.) */
const KEYED = new WeakMap();
let keysBound = false;
const bindKeys = () => {
  if (keysBound || typeof window === 'undefined') return;
  keysBound = true;
  window.addEventListener('keydown', (e) => { const h = KEYED.get(e.target); if (h) h(e); }, true);
};

/** The list for `input` (a text input the caller made). → { wrap (the field + its mark — what the label holds), el (the list
 *  and the field's note — placed by the caller right under the field's row), open, close, reload, added(name), state() }.
 *  `addCode` = the «Two-step code…» door (the caller's) — offered by the list when the vault holds none. */
export function otpField(input, { addCode = null } = {}) {
  const id = `vault-otp-list-${++seq}`;
  for (const [k, v] of NO_OFFER_ATTRS) input.setAttribute(k, v);
  input.removeAttribute('list');
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', id);
  const wrap = mk('span', 'vault-otp-wrap');
  const mark = mk('button', 'vault-otp-open', '▾');
  mark.type = 'button'; mark.tabIndex = -1;
  mark.title = t('Show the two-step codes in this vault'); mark.setAttribute('aria-label', mark.title);
  wrap.append(input, mark);
  const el = mk('div', 'vault-otp-box');
  const panel = mk('div', 'vault-otp-list');
  panel.id = id; panel.hidden = true;
  panel.dataset.keepClear = '';   // the voice plugin's microphone keeps clear of it while shown (src/lib/voice-input.js KEEP_CLEAR)
  panel.setAttribute('role', 'listbox'); panel.setAttribute('aria-label', t('Two-step codes in this vault'));
  const head = mk('div', 'vault-otp-head', t('Two-step codes in this vault'));
  const rowsEl = mk('div', 'vault-otp-rows');
  const stateEl = mk('div', 'vault-otp-state');
  panel.append(head, rowsEl, stateEl);
  const note = mk('div', 'vault-otp-note');
  note.setAttribute('role', 'status'); note.hidden = true;
  el.append(panel, note);

  const facts = { loaded: false, failed: false, names: [] };
  let loading = null, open = false, active = -1, rows = [], picking = false;
  const load = () => {
    if (loading) return loading;
    loading = loadTotp().then((r) => { facts.loaded = true; facts.failed = !r; facts.names = entriesOf(r); })
      .catch(() => { facts.loaded = true; facts.failed = true; facts.names = []; })
      .then(() => { loading = null; if (open) paint(); say(); });
    return loading;
  };
  const say = () => {
    const v = typedVerdict(facts, input.value);
    const words = v === 'unlisted' ? t('No two-step code of that name is in this vault — pick one from its list, or add it with «Two-step code…»') : '';
    if (note.textContent !== words) note.textContent = words;
    note.hidden = !words;
    input.setAttribute('aria-invalid', v === 'unlisted' ? 'true' : 'false');
  };
  const highlight = () => {
    rowsEl.querySelectorAll('.vault-otp-row').forEach((b, i) => { const on = i === active; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); if (on) { input.setAttribute('aria-activedescendant', b.id); try { b.scrollIntoView({ block: 'nearest' }); } catch { } } });
    if (active < 0) input.removeAttribute('aria-activedescendant');
  };
  /** the rows for what is typed (only the rows are redrawn — never the field or the box) */
  const paint = () => {
    const st = listState(facts);
    rows = st === 'rows' ? rowsOf(facts.names, input.value) : [];
    if (active >= rows.length) active = rows.length - 1;
    rowsEl.replaceChildren(...rows.map((r, i) => {
      const b = mk('button', 'vault-otp-row' + (r.match ? ' match' : ''));
      b.type = 'button'; b.tabIndex = -1; b.id = `${id}-${i}`; b.dataset.name = r.name;
      b.setAttribute('role', 'option');
      b.append(mk('span', 'vault-otp-name', r.name));
      b.addEventListener('pointerdown', (e) => e.preventDefault());   // the field keeps its focus: nothing blurs under the press
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => pick(r.name));
      return b;
    }));
    stateEl.replaceChildren();
    const words = st === 'loading' ? t('Reading the two-step codes in this vault…') : st === 'failed' ? t('The two-step codes in this vault could not be read')
      : st === 'empty' ? t('No two-step code in this vault yet') : '';
    if (words) {
      stateEl.append(mk('span', 'vault-otp-words', words));
      if (st === 'empty' && typeof addCode === 'function') {
        const door = mk('button', 'vault-otp-add', t('Two-step code…'));
        door.type = 'button';
        door.addEventListener('pointerdown', (e) => e.preventDefault());   // as a row: the press never blurs the field (a blur closes the list under it)
        door.addEventListener('mousedown', (e) => e.preventDefault());
        door.addEventListener('click', () => { close(); addCode(); });
        stateEl.append(door);
      }
    }
    stateEl.hidden = !words;
    stateEl.dataset.state = st;
    highlight();
  };
  const show = () => {
    if (!facts.loaded) load();
    open = true; panel.hidden = false; input.setAttribute('aria-expanded', 'true');
    paint();
  };
  const close = () => {
    open = false; active = -1; panel.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  };
  const pick = (name) => {
    picking = true;
    try { input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); } finally { picking = false; }
    close(); say();
    if (document.activeElement !== input) { try { input.focus({ preventScroll: true }); } catch { } }
  };
  input.addEventListener('focus', () => { if (!open) show(); });
  input.addEventListener('input', () => { if (picking) return; active = -1; if (!open) show(); else paint(); say(); });
  input.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== input) { close(); say(); } }, 0); });
  bindKeys();
  KEYED.set(input, (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const st = keyStep({ open, active }, e.key, rows.length);
    if (st.open && !open) show();
    else if (!st.open && open) close();
    if (open) { active = st.active; highlight(); }
    if (st.pick != null && rows[st.pick]) pick(rows[st.pick].name);
    if (st.taken) { e.preventDefault(); e.stopPropagation(); }
  });
  mark.addEventListener('pointerdown', (e) => e.preventDefault());
  mark.addEventListener('mousedown', (e) => e.preventDefault());
  mark.addEventListener('click', () => { const was = open && document.activeElement === input; if (document.activeElement !== input) { try { input.focus({ preventScroll: true }); } catch { } } if (was) close(); else show(); });
  return {
    wrap, el, open: show, close,
    reload: () => { facts.loaded = false; return load(); },
    /** a code just saved by the «Two-step code…» door: the list re-read and the field holds its name */
    added: (name) => { if (typeof name !== 'string' || !name) return; facts.loaded = false; input.value = name; load(); say(); },
    state: () => ({ open, active, rows: rows.slice(), ...facts, names: facts.names.slice() }),
  };
}
