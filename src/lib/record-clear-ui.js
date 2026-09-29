// "CLEAR CONTENT…" — the client half (2026-09-28, the owner's ask: scrub records
// a peer agent filled with content from an unrelated mailbox).
//
// ONE confirm dialog and ONE request path for every surface that offers the verb
// — the Task Group log window (a row's ⋯ / right-click, and "Clear selected (N)"),
// the For-you popup and window, Session Properties' status history, the
// Background Work panel and an agent group's window. Each surface only says
// WHICH records (`rows` = [{kind, id, groupId?, sessionKey?, at, words}]); this
// module names them back to the user (time + first words, ONE dialog built on
// createModalShell — never a native confirm), posts the clear, and says how it
// went (a toast either way — a failed user action is never silent). The store's
// broadcast then repaints every client, this one included; nothing here patches
// a record locally.
//
// THE WORDS: a cleared record's text fields hold the ENGLISH key CLEARED_TEXT
// (a store never holds a translated string) and `clearedAt` says it was
// cleared; `clearedText()` is the sentence in THIS device's language and
// `isCleared(rec)` the one test every renderer asks.
import { t, deviceLocale } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { CLEARED_TEXT, previewWords, chunked, MAX_ITEMS } from '../record-clear.js'; // PURE, shared with the server (the sentence, the preview cut, the per-request cap)

/** The cleared sentence in this device's language. */
export const clearedText = () => t(CLEARED_TEXT);
/** Was this record cleared? (the ONE flag — `clearedAt`, never a text compare) */
export const isCleared = (rec) => !!(rec && rec.clearedAt);
/** A record's text as a surface shows it: the device's sentence for a cleared one. */
export const shownText = (rec, text) => (isCleared(rec) ? clearedText() : text);

const SHOW_MAX = 8; // rows the dialog lists by name; the rest are counted

/**
 * A refusal in THIS device's words (verify r2: the toast printed the server's English
 * sentence to a zh / ja owner). The route answers a CODE (src/record-clear.js
 * REFUSALS); the codes an owner's own clear can meet are worded here — the others
 * (an agent token, a malformed request) never reach this page and fall back to the
 * server's sentence. `unreachable` = fetchJson's null (the request never answered).
 */
export function clearErrorText(code, fallback = '') {
  switch (code) {
    case 'not_found': return t('no such record');
    case 'unavailable': return t('the records are not available right now — try again in a moment');
    case 'failed': return t('it could not be saved — nothing was changed');
    case 'ambiguous': return t('several entries share that time — reopen the window and try again');
    case 'unreachable': return t('server unreachable');
    default: return fallback || t('it could not be saved — nothing was changed');
  }
}
const whenText = (at) => {
  if (!Number.isFinite(Number(at)) || !at) return '';
  try { return new Date(Number(at)).toLocaleString(deviceLocale(), { dateStyle: 'medium', timeStyle: 'short' }); } catch { return new Date(Number(at)).toLocaleString(); }
};

/** THE confirm dialog: names every record (its time + its first words) → Promise<boolean>. */
export function confirmClear(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const n = list.length;
  return new Promise((resolve) => {
    const { overlay, dialog, body, closeBtn } = createModalShell({
      id: 'record-clear-dialog', title: n === 1 ? t('Clear content?') : t('Clear the content of {n} records?', { n }),
      dialogClass: 'rc-dialog', closeOnBackdrop: false, minWidth: 'min(460px, 92vw)',
    });
    const ul = document.createElement('div');
    ul.className = 'rc-list';
    for (const r of list.slice(0, SHOW_MAX)) {
      const row = document.createElement('div');
      row.className = 'rc-item';
      const when = document.createElement('span');
      when.className = 'rc-when';
      when.textContent = whenText(r.at);
      const body = document.createElement('div');
      body.className = 'rc-body';
      const words = document.createElement('span');
      words.className = 'rc-words';
      const w = previewWords(r.words || '', 80);
      words.textContent = w ? `“${w}”` : t('(no text)'); // TEXT — the record's own words, agent-controlled
      body.appendChild(words);
      // WHY this record is in a Find batch when its shown words do not say it (verify r2): the Find box
      // matched its DETAIL — the text around the match, so nothing is selected without a visible reason
      if (r.match) {
        const m = document.createElement('div');
        m.className = 'rc-match';
        m.textContent = t('Found in the detail: {words}', { words: `“${previewWords(r.match, 90)}”` }); // TEXT
        body.appendChild(m);
      }
      row.append(when, body);
      ul.appendChild(row);
    }
    if (n > SHOW_MAX) {
      const more = document.createElement('div');
      more.className = 'rc-more';
      more.textContent = t('…and {n} more', { n: n - SHOW_MAX });
      ul.appendChild(more);
    }
    const hint = document.createElement('p');
    hint.className = 'dialog-hint rc-hint';
    hint.textContent = t('The text is replaced by “{sentence}”. Each record keeps its place and its time. This cannot be undone.', { sentence: clearedText() });
    // WHAT A CLEAR CANNOT REACH, said where the owner decides (lane-redact verify r4): every one of the five kinds reached
    // an agent before it could be cleared — injected into a member's turn, delivered as a notification or a wake, or
    // written by the agent itself — and a delivered turn is the harness's transcript (the census's declared exception).
    // "This cannot be undone" alone read as "the words are gone everywhere".
    const copies = document.createElement('p');
    copies.className = 'dialog-hint rc-copies';
    copies.textContent = t("An agent that already received these words keeps them in its own conversation — only VibeSpace's records change.");
    body.append(ul, hint, copies);
    const footer = document.createElement('div');
    footer.className = 'dialog-footer';
    const cancel = document.createElement('button');
    cancel.className = 'btn-cancel';
    cancel.textContent = t('Cancel');
    const ok = document.createElement('button');
    ok.className = 'btn-create danger rc-confirm';
    ok.textContent = n === 1 ? t('Clear content') : t('Clear {n} records', { n });
    footer.append(cancel, ok);
    dialog.appendChild(footer);
    const done = (v) => { overlay.remove(); resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = closeBtn.onclick = () => done(false);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(false); });
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter' && !e.isComposing && e.target !== cancel) { e.preventDefault(); done(true); }
    });
    setTimeout(() => ok.focus(), 0);
  });
}

/** The request body of ONE record. */
const itemOf = (r) => ({ kind: r.kind, id: r.id, ...(r.groupId ? { groupId: r.groupId } : {}), ...(r.sessionKey ? { sessionKey: r.sessionKey } : {}) });
const post = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Confirm, then clear. → Promise<{ok, cleared}> (ok false = cancelled, or not one request answered).
 * A batch bigger than the route's cap (MAX_ITEMS — "Select all shown" over a 500-entry log) goes
 * in consecutive parts; every part's outcome is counted, and a part that failed is said with the
 * others' result (a failed user action is never silent, and never hides what did clear).
 */
export async function clearRecords(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.kind && r.id != null);
  if (!list.length) return { ok: false, cleared: 0 };
  if (!(await confirmClear(list))) return { ok: false, cleared: 0, cancelled: true };
  // fetchJson never throws: null = unreachable, {error, code} = the route's refusal by name
  if (list.length === 1) {
    const r = await post('/api/records/clear', itemOf(list[0]));
    if (!r || !r.ok) { showToast(t('Could not clear: {why}', { why: clearErrorText(r ? r.code : 'unreachable', r && r.error) }), { type: 'error' }); return { ok: false, cleared: 0 }; }
    showToast(r.cleared ? t('Content cleared') : t('Already cleared'));
    return { ok: true, cleared: r.cleared || 0 };
  }
  let cleared = 0, answered = 0, missed = 0, why = '';
  const note = (code, fallback) => { if (!why) why = clearErrorText(code, fallback); };
  for (const part of chunked(list, MAX_ITEMS)) {
    const r = await post('/api/records/clear-many', { items: part.map(itemOf) });
    if (!r || !r.ok) { missed += part.length; note(r ? r.code : 'unreachable', r && r.error); continue; }
    answered++;
    cleared += r.cleared || 0;
    const refused = r.refused || [], unknown = r.unknown || [];
    missed += refused.length + unknown.length;
    if (refused.length) note(refused[0].code, refused[0].error);
    else if (unknown.length) note('not_found');
  }
  if (!answered) { showToast(t('Could not clear: {why}', { why }), { type: 'error' }); return { ok: false, cleared: 0 }; }
  if (missed) showToast(t('{n} cleared · {m} could not be cleared: {why}', { n: cleared, m: missed, why }), { type: 'error' });
  else showToast(cleared ? t('{n} cleared', { n: cleared }) : t('Already cleared'));
  return { ok: true, cleared };
}

/** The context-menu row every surface adds: `{label: 'Clear content…', action}`. */
export function clearMenuItem(rowsFn) {
  return { label: t('Clear content…'), action: () => { clearRecords(typeof rowsFn === 'function' ? rowsFn() : rowsFn); } };
}
