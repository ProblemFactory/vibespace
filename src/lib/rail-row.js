// THE RAIL ROW (lane ui-phone-and-fit M2 — the owner's walk of every surface, 2026-11-13: in the narrow rail panels names broke one
// character per line («OpenCod / e», «dev- / server»), states split over four lines and a status chip that IS the entry button was
// cut to «用 Fish …»). ONE row shape for a list a narrow column shows — a rail panel, the same panel hosted as a window — that
// reads at the sidebar's own widths (260 px, the 200 px floor) and stays on one line where there is room:
//   .rail-row        a WRAPPING flex row: [lead] [main] [ctl]
//   .rail-row-main   the name (+ its description, its meta line) — basis 9 em: beside the controls while both fit, else the
//                    controls drop to the next line and the name has the whole width; the name breaks between words only
//   .rail-row-ctl    the controls, one group, pushed right; each control keeps its whole width (a chip that is a button is
//                    never cut — it wraps inside itself only when it alone is wider than the line)
// More than ROW_INLINE_MAX controls: the rest fold into ONE «⋯» whose rows are their own words (the PURE count rule of
// row-fold-model.js — a primary control never folds). Gate: test-ui-fit (fast) ② + test-ui-fit-chrome (every rail panel at 260
// and 200 px: no word broken inside itself, nothing wider than its box, every control on one line).
import { rowActionsFold, ROW_INLINE_MAX } from './row-fold-model.js';
import { showContextMenu } from './utils.js';
import { t } from './i18n.js';

const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
/** a control's LABEL for the «⋯» menu — its own words (data-rail-label, aria-label, title, text): chrome, never a record's text
 *  (its own name: test-record-clear-census reads the For-you model's record-words accessor by its name) */
const labelOf = (c) => (c.dataset?.railLabel || c.getAttribute?.('aria-label') || c.title || c.textContent || '').trim();

/**
 * railRow({ row?, className?, lead?, name?, nameClass?, desc?, descClass?, main?, mainClass?, controls?, max? }) → the row element.
 *   row       an existing element to fill (its children are replaced) — else a new <div>
 *   lead      a node before the name (a dot, a glyph, an icon)
 *   name/desc strings (a name node is built with `nameClass`, a description with `descClass`); or `main` = nodes of your own
 *   controls  nodes in their order; a control carrying data-rail-primary never folds
 */
export function railRow({ row = null, className = '', lead = null, name = null, nameClass = '', desc = '', descClass = '', main = null, mainClass = '', controls = [], max = ROW_INLINE_MAX } = {}) {
  const r = row || el('div');
  r.classList.add('rail-row'); for (const c of String(className).split(/\s+/).filter(Boolean)) r.classList.add(c);
  const m = el('div', ('rail-row-main ' + mainClass).trim());
  if (name != null) { const n = el('div', ('rail-row-name ' + nameClass).trim()); n.textContent = name; m.appendChild(n); }
  if (desc) { const d = el('div', ('rail-row-desc ' + descClass).trim()); d.textContent = desc; m.appendChild(d); }
  for (const x of (main || [])) if (x) m.appendChild(x);
  const ctl = el('div', 'rail-row-ctl');
  const list = (controls || []).filter(Boolean);
  const v = rowActionsFold({ items: list.map((c, i) => ({ key: String(i), px: 1, primary: c.dataset?.railPrimary === '1' })), widthPx: 1e9, max });
  const folded = new Set(v.folded);
  list.forEach((c, i) => { if (!folded.has(String(i))) ctl.appendChild(c); });
  if (folded.size) {
    const more = el('button', 'rail-row-more'); more.type = 'button'; more.textContent = '⋯'; more.title = t('More'); more.setAttribute('aria-label', t('More'));
    const rest = list.filter((_, i) => folded.has(String(i)));
    // the reader's minor: a folded GROUP (a <div> of buttons — the manifest plugin's Update · Uninstall) is its BUTTONS, one row
    // each; a control that cannot act is an OFF row that says WHY on the row (utils.js showContextMenu's `off` — ui-controls'
    // rule since 2.369.402: a row works, or it is a caption, or it is off with its why), never a toast, never a silent nothing
    const rows = rest.flatMap((c) => (c.tagName === 'BUTTON' ? [c] : [...c.querySelectorAll('button')]));
    more.onclick = (e) => { e.stopPropagation(); const b = more.getBoundingClientRect(); showContextMenu(b.left, b.bottom + 2, rows.map((c) => (c.disabled ? { label: labelOf(c), off: c.title || t('not available') } : { label: labelOf(c), title: c.title || '', action: () => c.click() }))); };
    ctl.appendChild(more);
  }
  r.replaceChildren(...[lead, m, ctl].filter(Boolean));
  return r;
}
