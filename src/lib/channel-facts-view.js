/**
 * A MESSAGE'S FACTS IN THE WINDOW (lane message-facts, B-f066 — design 007, docs/design-communication-panel.zh.md §26).
 * ONE element per message under its head: the SUMMARY — a one-line button, "to me, Alice Chen, Bob +3 · cc Carol" (names
 * first; every address in its tooltip) — the CHIPS after it ("mailing list dev@…", "high importance", "automated"), and
 * on a click the DETAILS: a keyed list (To · Cc · Bcc · Reply-To · Sent by · Mailing list · Delivered to · Subject), each
 * party "Name · address". Drawn by VALUE TYPE from src/channel-facts.js — no kind is named here; textContent only (every
 * string is a stranger's header).
 *
 * The open state lives in the window's `folds` (`facts:<vid>`), so a repaint — a new message arriving — never closes it;
 * a details row's "+N" expands in place (`facts:<vid>:<kind>`). Facts that are only chips come back marked
 * `chanmsg-facts-inline` (the caller puts them beside the time). A record stored before its facts (`factsAsk`) shows a
 * small "Details" button: its click asks the server ONCE (`ask(rec)` → the facts, or null after a refusal it showed).
 */
import { t, deviceLocale } from './i18n.js';
import { el, icon } from './channel-chrome.js';
import * as CF from '../channel-facts.js';

const foldGet = (folds, k) => !!(folds && typeof folds.get === 'function' && folds.get(k));
const foldSet = (folds, k, v) => { if (folds && typeof folds.set === 'function') folds.set(k, v); };

/** The chips of a fact list, or null. */
export function factsChips(facts) {
  const chips = CF.chipsOf(facts, t);
  if (!chips.length) return null;
  const box = el('span', 'chanmsg-facts-chips');
  for (const c of chips) {
    const x = el('span', 'chanmsg-fact-chip', c.text);
    x.dataset.k = c.k;
    if (c.title && c.title !== c.text) x.title = c.title;
    if (c.time) x.title = `${c.text} · ${new Date(c.time).toLocaleString(deviceLocale())}`;   // lane message-facts-lark: a TIME chip ("edited") tells its instant
    box.appendChild(x);
  }
  return box;
}

/** The DETAILS list (a `dl`): one row per fact the table words for the details, its "+N" expanding in place. */
function detailsList(vid, facts, folds) {
  const dl = el('dl', 'chanmsg-facts-details');
  for (const row of CF.detailRows(facts, t)) {
    const dd = el('dd', 'chanmsg-fact-val');
    dd.dataset.k = row.k;
    const fk = `facts:${vid}:${row.k}`;
    const vals = foldGet(folds, fk) ? row.values : row.values.slice(0, row.shown);
    vals.forEach((v, i) => {
      if (i) dd.appendChild(document.createTextNode(', '));
      const s = el('span', 'chanmsg-fact-party', v.time ? new Date(v.time).toLocaleString(deviceLocale()) : v.text);
      if (v.title) s.title = v.title;
      dd.appendChild(s);
    });
    const hidden = row.values.length - vals.length;
    if (hidden > 0) {
      const b = el('button', 'chanmsg-fact-more', `+${hidden}`);
      b.type = 'button';
      b.title = t('Show all');
      b.addEventListener('click', (ev) => { ev.stopPropagation(); foldSet(folds, fk, true); dl.replaceWith(detailsList(vid, facts, folds)); });
      dd.appendChild(b);
    }
    if (row.more) dd.appendChild(el('span', 'chanmsg-fact-note', t('and {n} more', { n: row.more })));
    if (row.cut && !row.values.length) dd.appendChild(el('span', 'chanmsg-fact-note', row.cutText));
    dl.append(el('dt', 'chanmsg-fact-key', row.label), dd);
  }
  return dl;
}

/** The facts element of ONE record, or null (no facts and nothing to ask). */
export function renderFacts(rec, { folds = null, ask = null } = {}) {
  const vid = String(rec.vendorId || rec.id || '');
  const facts = Array.isArray(rec.facts) ? rec.facts : [];
  if (!facts.length) {
    if (!rec.factsAsk || typeof ask !== 'function') return null;
    const b = el('button', 'chanmsg-facts chanmsg-facts-ask', t('Details'));
    b.type = 'button';
    b.title = t('Show who this message was sent to');
    b.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      b.disabled = true;
      const got = await ask(rec);
      if (!got) { b.disabled = false; return; }
      foldSet(folds, `facts:${vid}`, true);
      b.replaceWith(renderFacts({ ...rec, facts: got, factsAsk: false }, { folds, ask }) || el('div', 'chanmsg-facts chanmsg-facts-none', t('This message names no recipients.')));
    });
    return b;
  }
  const sum = CF.summaryOf(facts, t);
  const hasRows = CF.detailRows(facts, t).length > 0;
  const chips = factsChips(facts);
  if (!sum && !hasRows) { if (chips) chips.classList.add('chanmsg-facts-inline'); return chips; }
  const key = `facts:${vid}`;
  const open = foldGet(folds, key);
  const box = el('div', 'chanmsg-facts' + (open ? ' chanmsg-facts-open' : ''));
  box.dataset.vid = vid;
  const tog = el('button', 'chanmsg-facts-sum');
  tog.type = 'button';
  tog.setAttribute('aria-expanded', open ? 'true' : 'false');
  tog.appendChild(icon(open ? 'chevronDown' : 'chevronRight', 10));
  tog.appendChild(el('span', 'chanmsg-facts-text', sum ? sum.text : t('Details')));
  if (sum && sum.title) tog.title = sum.title;
  tog.addEventListener('click', (ev) => { ev.stopPropagation(); foldSet(folds, key, !open); box.replaceWith(renderFacts(rec, { folds, ask })); });
  box.appendChild(tog);
  if (chips) box.appendChild(chips);
  if (open) box.appendChild(detailsList(vid, facts, folds));
  return box;
}
