// THE PASSKEYS TABLE (lane passkey-ui; docs/design-passkey-store.zh.md §2.5) — one profile's passkeys in the Agent
// browser panel: the agents-never switch + its one sentence, then Site · User · Source (agent / you, with the date) · Last
// used · Policy (allow / ask each time / never — a segmented control, ONE PATCH per change) · ⋯ (Delete… names the site
// and the user). Desk: a fold-out section under the profile's row (it spans the table's grid); phone: a bottom sheet.
// The words and which rows exist come from the PURE model (browser-panel-model passkeyTable — a row carrying a key field
// is refused); rows are keyed by id and PATCHED in place (never a re-render); the site and user names are peer-controlled
// text — textContent only. Owner routes (P1): GET /api/browser/passkeys?profile=, PATCH/DELETE …/:profile/:id, PUT
// …/:profile/switch.
import { t } from './i18n.js';
import { fetchJson, showToast, showConfirmDialog, showContextMenu, escHtml } from './utils.js';
import { icon as chromeIcon } from './channel-chrome.js';
import { UI_ICONS } from './icons.js';
import { passkeyTable, passkeyDeleteWords } from './browser-panel-model.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
async function act(url, init, what) {
  const r = await fetchJson(url, init);
  if (!r || r.error) { showToast(t('{what} — {reason}', { what, reason: (r && r.error) || t('server unreachable') }), { type: 'error', duration: 9000 }); return null; }
  return r;
}
const pkUrl = (pid, id) => `/api/browser/passkeys/${encodeURIComponent(pid)}${id ? '/' + encodeURIComponent(id) : ''}`;
const jsonInit = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
/** A phone-width window: the table opens as a bottom sheet. */
export function isPhoneWidth() { return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 640px)').matches; }

/** One open table: `{sec, sheet, load, close}` — `sec` goes under the row on a desk (the caller places it); on a phone it
 *  is already in its sheet on document.body. `words` = the panel's WORDS (t / ago / date). */
export function createPasskeysSection({ profileId, label = '', words = null, phone = false, onClose = null } = {}) {
  const WORDS = words || { t };
  const r = { id: String(profileId), label: String(label || profileId) };
  let closed = false;
  const sec = el('div', 'bprof-pk'); sec.dataset.profileId = r.id;
  const top = el('div', 'bprof-pk-top');
  top.appendChild(el('span', 'bprof-pk-title', t('Passkeys — {label}', { label: r.label })));
  const x = el('button', 'file-tool-btn bprof-pk-close'); x.type = 'button'; x.innerHTML = UI_ICONS.close || '×'; x.title = t('Close'); x.setAttribute('aria-label', x.title); x.onclick = () => close();
  top.appendChild(x);
  const head = el('div', 'bprof-pk-head');
  const swl = el('label', 'bprof-pk-switch'); const sw = document.createElement('input'); sw.type = 'checkbox'; sw.className = 'bprof-pk-switch-box';
  const swt = el('span', 'bprof-pk-switch-text', '');
  swl.append(sw, swt); head.append(swl, el('span', 'bprof-pk-note chat-status-dim', ''));
  const err = el('div', 'bprof-pk-err'); err.hidden = true;
  const body = el('div', 'bprof-pk-table');
  sec.append(top, head, err, body);
  const o = { sec, body, head, sw, swt, err, rows: new Map(), sheet: null, empty: null, cols: null, words: WORDS };
  sw.onchange = async () => { const want = sw.checked; sw.disabled = true; const res = await act(pkUrl(r.id, 'switch'), jsonInit('PUT', { agentsOff: want }), t('Could not change the passkey switch')); sw.disabled = false; sw.checked = res ? !!res.agentsOff : !want; };
  if (phone) {
    const sheet = el('div', 'bprof-pk-sheet'); const scrim = el('div', 'bprof-pk-scrim'); scrim.onclick = () => close();
    sec.classList.add('bprof-pk-in-sheet'); sheet.append(scrim, sec); document.body.appendChild(sheet); o.sheet = sheet;
  }
  function close() { if (closed) return; closed = true; sec.remove(); if (o.sheet) o.sheet.remove(); if (onClose) onClose(); }
  const load = () => pkLoad(r.id, o, () => closed);
  return { sec, sheet: o.sheet, load, close, rows: o.rows };
}
async function pkLoad(pid, o, isClosed) {
  const res = await fetchJson(`/api/browser/passkeys?profile=${encodeURIComponent(pid)}`);
  if (isClosed()) return;
  if (!res || res.error || !res.ok) { o.err.textContent = t('Passkeys unavailable: {why}', { why: String((res && res.error) || t('server unreachable')) }); o.err.hidden = false; return; }
  o.err.hidden = true; pkPaint(pid, o, res);
}
function pkPaint(pid, o, list) {
  const m = passkeyTable(list, { w: o.words });
  o.sw.checked = m.switchOn; if (o.swt.textContent !== m.switchLabel) o.swt.textContent = m.switchLabel;
  const note = o.head.querySelector('.bprof-pk-note'); if (note.textContent !== m.note) note.textContent = m.note;
  if (!o.cols) { o.cols = el('div', 'bprof-pk-row bprof-pk-cols'); for (const c of m.columns) o.cols.appendChild(el('span', 'bprof-pk-th', c)); o.body.appendChild(o.cols); }
  o.cols.hidden = !m.rows.length;
  const seen = new Set();
  for (const row of m.rows) { seen.add(row.id); pkRowPatch(pid, o, row); }
  for (const [id, x] of [...o.rows]) if (!seen.has(id)) { x.row.remove(); o.rows.delete(id); }
  if (!m.empty) { if (o.empty) { o.empty.remove(); o.empty = null; } }
  else if (!o.empty) { o.empty = el('div', 'bprof-pk-empty chat-status-dim'); o.empty.append(el('span', '', m.empty.line), el('code', 'bprof-pk-hint', m.empty.hint)); o.body.appendChild(o.empty); }
}
function pkRowPatch(pid, o, row) {
  const sig = JSON.stringify(row);
  let x = o.rows.get(row.id);
  if (!x) {
    const r = el('div', 'bprof-pk-row'); r.dataset.pk = row.id;
    const cell = (cls) => { const c = el('span', 'bprof-pk-cell ' + cls); r.appendChild(c); return c; };
    cell('bprof-pk-site'); cell('bprof-pk-user'); cell('bprof-pk-source'); cell('bprof-pk-used');
    const seg = cell('bprof-pk-policy'); seg.setAttribute('role', 'radiogroup');
    const more = el('button', 'file-tool-btn bprof-pk-more'); more.type = 'button'; more.appendChild(chromeIcon('more', 14)); more.title = t('More actions'); more.setAttribute('aria-label', more.title);
    more.onclick = (ev) => { ev.stopPropagation(); const cur = o.rows.get(row.id); const rc = more.getBoundingClientRect(); showContextMenu(rc.left, rc.bottom + 2, [{ label: t('Delete…'), labelHtml: `<span class="bprof-mi bprof-pk-delete">${escHtml(t('Delete…'))}</span>`, style: 'color: var(--red, #e55)', action: () => pkDelete(pid, o, cur ? cur.model : row) }]); };
    r.appendChild(more);
    x = { row: r, sig: '', model: row }; o.rows.set(row.id, x);
    o.body.insertBefore(r, o.empty || null);
  }
  x.model = row;
  if (x.sig === sig) return;
  x.sig = sig;
  const r = x.row, set = (cls, v, title) => { const c = r.querySelector('.' + cls); if (c.textContent !== v) c.textContent = v; c.title = title || v; };
  set('bprof-pk-site', row.site); set('bprof-pk-user', row.user, row.userTitle || row.user); set('bprof-pk-source', row.sourceText); set('bprof-pk-used', row.lastUsed, t('{n} sign-in(s)', { n: row.uses }));
  r.dataset.source = row.source; r.dataset.policy = row.policy;
  const seg = r.querySelector('.bprof-pk-policy');
  if (!seg.children.length) for (const s of row.segments) { const b = el('button', 'bprof-pk-seg', s.label); b.type = 'button'; b.dataset.policy = s.value; b.setAttribute('role', 'radio'); b.onclick = () => pkPolicy(pid, o, row.id, s.value); seg.appendChild(b); }
  for (const b of seg.children) { const on = b.dataset.policy === row.policy; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
}
async function pkPolicy(pid, o, id, policy) {
  const x = o.rows.get(id); if (!x || x.model.policy === policy || x.busy) return;
  x.busy = true;
  const res = await act(pkUrl(pid, id), jsonInit('PATCH', { policy }), t('Could not change the passkey policy'));
  x.busy = false;
  if (res && res.key) { const m = passkeyTable({ keys: [res.key], agentsOff: o.sw.checked }, { w: o.words }); if (m.rows[0]) pkRowPatch(pid, o, m.rows[0]); }
}
async function pkDelete(pid, o, row) {
  const w = passkeyDeleteWords(row, { w: o.words });
  const yes = await showConfirmDialog({ title: w.title, message: w.message, confirmText: w.confirm, danger: true });
  if (!yes) return;
  const res = await act(pkUrl(pid, row.id), jsonInit('DELETE'), t('Could not delete the passkey'));
  if (!res) return;
  const x = o.rows.get(row.id); if (x) { x.row.remove(); o.rows.delete(row.id); }
  showToast(t('Deleted the passkey for {site}', { site: row.site }), { duration: 4000 });
  pkLoad(pid);
}
