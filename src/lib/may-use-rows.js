// THE «WHAT IT MAY USE» ROWS — the New Session form's right column and Session Properties' «What it may use» section draw
// with THESE renderers (unit what-it-may-use, 主开发 2026-11-17: «reuse its row renderer and its account model, do not build a
// twin»). Lifted unchanged out of new-session-form.js _nsPaintRight (its `prov` / `acc` closures and its account rows): the
// same classes, the same CSS, the same words; the form's output stays byte for byte (test-new-session-form pins it).
//   doorBtn(door, label, extra)  — a row's door (a link button with data-door)
//   provRow(r)                   — one resource as the desktop's card row
//   accLine(r, open)             — one resource as the phone's accordion line (its body under it)
//   grantedAccountHtml(r, {groupNameOf, exceptName, quoted}) — a channel account a Task Group (or everyone) grants: ticked and
//                                  locked, «through …», its 「除了」, the door to the Channels window
//   tickAccountHtml(r, {ticked, words: [on, off]}) — a channel account the person ticks (the form: at create; Properties: now)
import { escHtml } from './utils.js';
import { t } from './i18n.js';

export const doorBtn = (door, label, extra = '') => `<button type="button" class="ns-link" data-door="${door}" ${extra}>${escHtml(label)} ›</button>`;
// one resource = { key, cls, icon, name, what, end (the desktop's door / mark), sub (its rows), sum + badge (the phone's line), body (the phone's rows) }
export const provRow = (r) => `<div class="ns-prov${r.cls ? ' ' + r.cls : ''}" ${r.data || ''}><span class="ns-pv-tick">${r.icon}</span><span class="ns-pv-name">${escHtml(r.name)}</span><span class="ns-pv-what">${escHtml(r.what || '')}</span><span class="ns-pv-end">${r.end || ''}</span>${r.sub ? `<div class="ns-pv-sub">${r.sub}</div>` : ''}</div>`;
export const accLine = (r, open) => `<div class="ns-res${open ? ' open' : ''}${r.cls ? ' ' + r.cls : ''}" ${r.data || ''}><button type="button" class="ns-res-h" data-res-tog="${r.key}" aria-expanded="${open}"><span class="ns-res-ic">${r.icon}</span><span class="ns-res-t"><b>${escHtml(r.name)}</b><small>${escHtml(r.sum || '')}</small></span>${r.badge || '<span></span>'}<span class="ns-res-chev" aria-hidden="true">›</span></button><div class="ns-res-body">${r.body != null ? r.body : r.sub || ''}</div></div>`;
export const authWords = (a) => (a === 'send' ? t('can send') : t('draft only'));
const kindChip = (r) => `<span class="ns-chan-k">${escHtml(r.vendor || r.kind)}</span>`;
export function grantedAccountHtml(r, { groupNameOf, exceptName, quoted }) {
  const via = r.everyone ? t('All agents · {authority}', { authority: authWords(r.authority) }) : t('Through Task Group {names} · {authority}', { names: quoted(r.groups.map(groupNameOf)), authority: authWords(r.authority) });
  const exc = r.except.map((p) => `<span class="ns-exc">${escHtml(t('Except: '))}<b>${escHtml(exceptName(p))}</b></span>`).join('');
  return `<div class="ns-acc granted" data-acc-row="${escHtml(r.id)}"><input type="checkbox" checked disabled aria-label="${escHtml(t('“{name}” comes through its Task Group', { name: r.label }))}"><span class="ns-acc-n">${kindChip(r)}${escHtml(r.label)}</span><span class="ns-pv-via">${escHtml(via)}${exc}</span><span class="ns-acc-end">${doorBtn('chan', t('Except…'), `data-acc="${escHtml(r.id)}" title="${escHtml(t('Who is left out is set where the account is shared — the Channels window'))}"`)}</span></div>`;
}
export function tickAccountHtml(r, { ticked, words }) {
  return `<label class="ns-acc${ticked ? ' on' : ''}" data-acc-row="${escHtml(r.id)}"><input type="checkbox" data-acc="${escHtml(r.id)}" ${ticked ? 'checked' : ''} aria-label="${escHtml(t('Let this conversation see “{name}”', { name: r.label }))}"><span class="ns-acc-n">${kindChip(r)}${escHtml(r.label)}</span><span class="ns-pv-via${ticked ? ' ok' : ' dim'}">${escHtml(ticked ? words[0] : words[1])}</span></label>`;
}
