// THE TWO-STEP NAME FIELD's OWN LIST (lane vault-2fa-pick, 2026-11-17 — the owner: «只弹出了我截图里那个浏览器的推荐输入，没有
// vibespace自己的下拉框»). The field of the add door's fields (src/lib/vault-login-row.js loginFields: the Vault's 添加 ▸ 网站登录…
// dialog, the login card an agent's ask files — in the tray and in its own window) named the vault's two-step codes through
// the browser's NATIVE list (the tree's only <datalist>); every platform draws that list as its own suggestion popup, and the
// owner read it as the browser's history. Now THE PAGE draws the list:
//   · opened by the field's own mark (the icon set's chevron at its right end) and by focus; headed in plain words; a row per code by its NAME (the
//     vault's own, unique — GET /api/vault/totp answers names);
//   · placed UNDER the field and taking NO room in the flow (cure, 主开发 2026-11-18 00:02Z: a list in the flow that closed on
//     blur moved Save between a press's down and its up — the press landed on nothing; opening it pushed Save down the same
//     way): absolutely placed in the field's own box, inside the dialog's scroll box, as wide as the field. It is ATTACHED when
//     it opens and REMOVED when it closes — the voice plugin's follower watches the field's parent's children, so the
//     microphone re-places at each, and keeps clear of it ([data-keep-clear], src/lib/voice-input.js KEEP_CLEAR);
//   · keys (PURE src/lib/vault-otp-field-model.js keyStep): ↓ opens / moves, ↑ moves, Enter picks the highlighted row, Escape
//     closes the list and is TAKEN — heard at the window's capture, before the tray's and the form's own Escape — Tab leaves;
//     a composing key is never read; a press on a row keeps the focus in the field (no blur, nothing closes under it);
//   · the field still takes a typed name; one that names no code is said UNDER THE FIELD at once (the add door's own sentence),
//     not only at Save; a vault with none says so with the «Two-step code…» door (the caller's: the card moves its box first);
//     a LOCKED vault says so with its Unlock… door (never «could not be read»); a read already in flight when a code was saved is
//     never trusted for «no such name» — the list reads again;
//   · the browser offers nothing of its own here: no `list`, autocomplete off, and the password managers' ignore marks.
// Only the list's rows are redrawn (on open and as the person types) — never the field, never the box it sits in.
import { t } from './i18n.js';
import { fetchJson } from './utils.js';
import { afterPointerUp } from './blur-commit.js';   // THE press witness (document capture): a blur a press causes acts after its release
import { showUnlock } from './vault-unlock.js';   // a LOCKED vault: the list says so with THE unlock dialog's door
import { entriesOf, listState, rowsOf, typedVerdict, keyStep, typedSettled } from './vault-otp-field-model.js';

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** the field's mark: THE icon set's chevronDown (src/lib/icons.js), built as SVG nodes — the UI draws icons as SVG, never a glyph */
const chevron = () => {
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), d = document.createElementNS(NS, 'path');
  for (const [k, v] of [['aria-hidden', 'true'], ['focusable', 'false'], ['viewBox', '0 0 16 16'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.5'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['style', 'width:1em;height:1em;vertical-align:-0.125em']]) svg.setAttribute(k, v);
  d.setAttribute('d', 'M3.5 6l4.5 4.5L12.5 6');
  svg.append(d);
  return svg;
};
/** The marks that keep the browser and the password managers off the field (no autofill, no history, no saved-login offer). */
export const NO_OFFER_ATTRS = Object.freeze([['autocomplete', 'off'], ['autocapitalize', 'off'], ['autocorrect', 'off'], ['data-lpignore', 'true'], ['data-1p-ignore', 'true'], ['data-bwignore', 'true'], ['data-form-type', 'other']]);
let seq = 0;
/** The box that clips the list: the nearest ancestor that scrolls, hides overflow or contains its paint (the chat's message —
 *  `.chat-msg { contain: … paint }`). The open list is capped to the room under the field inside it (and inside the window). */
const clipBoxOf = (n) => { for (let x = n && n.parentElement; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (/auto|scroll|hidden|clip/.test(cs.overflowY) || /paint|strict|content/.test(cs.contain || '')) return x; } return null; };
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
  const mark = mk('button', 'vault-otp-open');
  mark.append(chevron());
  mark.type = 'button'; mark.tabIndex = -1;
  mark.title = t('Show the two-step codes in this vault'); mark.setAttribute('aria-label', mark.title);
  wrap.append(input, mark);
  const el = mk('div', 'vault-otp-box');
  const panel = mk('div', 'vault-otp-list');   // in the field's own box while open (absolutely placed: no room in the flow)
  panel.id = id;
  panel.dataset.keepClear = '';   // the voice plugin's microphone keeps clear of it while shown (src/lib/voice-input.js KEEP_CLEAR)
  panel.setAttribute('role', 'listbox'); panel.setAttribute('aria-label', t('Two-step codes in this vault'));
  const head = mk('div', 'vault-otp-head', t('Two-step codes in this vault'));
  const rowsEl = mk('div', 'vault-otp-rows');
  const stateEl = mk('div', 'vault-otp-state');
  panel.append(head, rowsEl, stateEl);
  panel.addEventListener('pointerdown', (e) => e.preventDefault());   // a press anywhere on the list (its heading too) keeps the focus in the field
  panel.addEventListener('mousedown', (e) => e.preventDefault());
  const note = mk('div', 'vault-otp-note');
  note.setAttribute('role', 'status'); note.hidden = true;
  el.append(note);

  const facts = { loaded: false, failed: false, locked: false, state: null, names: [], reading: false };
  let loading = null, gen = 0, open = false, active = -1, rows = [], picking = false;
  /** ONE read of the vault's names. `fresh` = a read the caller cannot trust an earlier one for (a code was just saved): the
   *  generation moves, and an answer that was already in flight is dropped when it lands (never said as «no such name»). */
  const load = (fresh = false) => {
    if (loading && !fresh) return loading;
    const my = ++gen;
    facts.reading = true;
    loading = fetchJson('/api/vault/totp').then((r) => {
      if (my !== gen) return;
      const locked = !!(r && !r.ok && /vault_locked/.test(String(r.code || '')));
      Object.assign(facts, { loaded: true, failed: !(r && r.ok) && !locked, locked, state: r && r.ok ? r.state || null : locked ? 'locked' : null, names: r && r.ok ? entriesOf(r) : [] });
    }).catch(() => { if (my === gen) Object.assign(facts, { loaded: true, failed: true, locked: false, state: null, names: [] }); })
      .then(() => { if (my !== gen) return; loading = null; facts.reading = false; if (open) paint(); say(); });
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
  /** a door of the list (Unlock… / Two-step code…): Escape closes the list and the focus goes back to the field */
  const doorKeys = (e) => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); close(); try { input.focus({ preventScroll: true }); } catch { } } };
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
    const words = st === 'loading' ? t('Reading the two-step codes in this vault…') : st === 'locked' ? t('The vault is locked, so its two-step codes cannot be read')
      : st === 'failed' ? t('The two-step codes in this vault could not be read') : st === 'empty' ? t('No two-step code in this vault yet') : '';
    if (words) {
      stateEl.append(mk('span', 'vault-otp-words', words));
      if (st === 'empty' && typeof addCode === 'function') {
        const door = mk('button', 'vault-otp-add', t('Two-step code…'));
        door.type = 'button';
        door.addEventListener('pointerdown', (e) => e.preventDefault());   // as a row: the press never blurs the field (a blur closes the list under it)
        door.addEventListener('mousedown', (e) => e.preventDefault());
        door.addEventListener('click', () => { close(); addCode(); });
        KEYED.set(door, doorKeys);
        stateEl.append(door);
      }
      if (st === 'locked') {   // the refusal names its door: THE unlock dialog, then the list reads again
        const door = mk('button', 'vault-otp-unlock', t('Unlock…'));
        door.type = 'button';
        door.addEventListener('pointerdown', (e) => e.preventDefault());
        door.addEventListener('mousedown', (e) => e.preventDefault());
        door.addEventListener('click', () => { close(); showUnlock({ then: () => load(true) }); });
        KEYED.set(door, doorKeys);
        stateEl.append(door);
      }
    }
    stateEl.hidden = !words;
    stateEl.dataset.state = st;
    highlight();
  };
  const show = () => {
    if (!loading) load(true);   // every opening reads the vault's names again (a code added elsewhere, an unlock) — cure round 2
    open = true; input.setAttribute('aria-expanded', 'true');
    paint();
    if (!panel.isConnected) wrap.append(panel);   // attached: no room in the flow; the follower re-places on the child list
    // capped to the room under the field inside the box that clips it (never cut by the chat's message, never a scrollbar that
    // narrows the dialog): at most 220 px, at least two rows
    const clip = clipBoxOf(wrap), z = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const bottom = Math.min(clip ? clip.getBoundingClientRect().bottom : innerHeight, innerHeight), room = (bottom - wrap.getBoundingClientRect().bottom - 6) / z;
    panel.style.maxHeight = `${Math.round(Math.max(72, Math.min(220, room)))}px`;
  };
  const close = () => {
    open = false; active = -1; panel.remove(); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  };
  const pick = (name) => {
    picking = true;
    try { input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); } finally { picking = false; }
    close(); say();
    if (document.activeElement !== input) { try { input.focus({ preventScroll: true }); } catch { } }
  };
  input.addEventListener('focus', () => { if (!open) show(); });
  input.addEventListener('input', () => {
    if (picking) return;
    active = -1;
    if (facts.loaded && typedSettled(facts.names, input.value)) { if (open) close(); say(); return; }   // a listed name typed in full: the choice is made
    if (!open) show(); else paint();
    say();
  });
  const away = () => document.activeElement !== input && !panel.contains(document.activeElement);
  const closeIfAway = () => { if (away()) { close(); say(); } };
  const onLeave = () => setTimeout(() => {
    if (!away()) return;
    // a pointer press moved the focus: the list closes only AFTER that press's release, its click landed first (nothing
    // moves between its down and its up, whatever the list's placement — cure round 2); a key (Tab) closes it at once.
    // blur-commit.js's own witness: no listener of this field's at the window or the document (test-window-drag's census)
    afterPointerUp(closeIfAway);
  }, 0);
  input.addEventListener('blur', onLeave);
  panel.addEventListener('focusout', onLeave);
  bindKeys();
  KEYED.set(input, (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Tab' && !e.shiftKey && open) {   // the list's own door (Unlock… / Two-step code…) is the next stop by keyboard
      const door = stateEl.querySelector('button');
      if (door) { e.preventDefault(); e.stopPropagation(); door.focus(); return; }
    }
    const st = keyStep({ open, active }, e.key, rows.length);
    if (st.open && !open) show();
    else if (!st.open && open) close();
    if (open) { active = st.active; highlight(); }
    if (st.pick != null && rows[st.pick]) pick(rows[st.pick].name);
    // (a window-capture listener registered BEFORE this one — customize mode's — still hears the key first; none takes these today)
    if (st.taken) { e.preventDefault(); e.stopPropagation(); }
  });
  mark.addEventListener('pointerdown', (e) => e.preventDefault());
  mark.addEventListener('mousedown', (e) => e.preventDefault());
  mark.addEventListener('click', () => { const was = open && document.activeElement === input; if (document.activeElement !== input) { try { input.focus({ preventScroll: true }); } catch { } } if (was) close(); else show(); });
  return {
    wrap, el, open: show, close,
    reload: () => load(true),
    /** a code just saved by the «Two-step code…» door: the field holds its name and the list reads AGAIN — a read that was in
     *  flight before the save is dropped, so «no such name» is never said of the name just saved */
    added: (name) => { if (typeof name !== 'string' || !name) return; facts.loaded = false; input.value = name; say(); load(true); },
    state: () => ({ open, active, rows: rows.slice(), ...facts, names: facts.names.slice() }),
  };
}
