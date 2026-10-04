/**
 * inbox-window-layout.js — PURE (imports nothing, DOM-free): the For-you
 * WINDOW's arithmetic (docs/design-user-inbox-reply.md §9, 2026-09-27).
 *
 * The owner: "有时候agent给我发好几条很长的消息，在这么小的面板很难review，给我做一个
 * 对长文本更友好的"展开详情"面板吧，可以打开一个独立窗口来查看和处理这个inbox里的消息。"
 * The window (src/lib/inbox-window.js) is a mail client over the SAME store and
 * the SAME row order the popup uses (user-todos-layout.js openLayout/nextLayout/
 * entriesFor/splitNotices/noticeGroups — one implementation); what is NEW about
 * it is decided here, so every rule is a table in scripts/test-inbox-window-model.mjs:
 *
 *   nextSelection(entries, resolvedId) — THE MAIL-CLIENT RULE: after THIS client
 *                                        resolved the selected item, the next OPEN
 *                                        entry below it, else the previous open one
 *                                        above it, else nothing
 *   holdSelection(entries, selectedId) — what stays selected when the list changes
 *                                        under it (a broadcast, a filter, a tab)
 *   paneMode(width, {touch})           — one pane or two (NARROW_PX, the ONE
 *                                        threshold) and the row floor on touch
 *   scopeRows(entries, {sessionKey, query, tab, textOf}) — the rows the left
 *                                        pane lists: the tab, the session scope,
 *                                        the text filter
 *   rowPreview(detail, max)            — the list row's one-line cut of the detail
 *                                        (plain words: markdown marks dropped)
 *   itemView(item, ctx)                — the right pane as STRUCTURE: its meta
 *                                        words (t and the word functions injected),
 *                                        the option chips, the reply verdict, the
 *                                        action row, the text Copy puts on the
 *                                        clipboard
 *
 * `entries` everywhere = the window's flat list in DISPLAY order, each
 * `{item, resolved, notice?, key?}` (the popup's entry shape — resolved = the
 * row left `open` and holds its slot until the next open).
 */

/** Below this width (CSS px of the window's content) the window shows ONE pane
 *  at a time — the list, or the item with a ‹ back button. Two panes need a
 *  list of ~260 px beside an item pane still wide enough to read prose. */
export const NARROW_PX = 620;
/** A list row's minimum height on a touch device (the house touch target). */
export const TOUCH_ROW_PX = 36;
/** The two list pages: the asks (needs you) and the for-your-information notices. */
export const TABS = Object.freeze(['actions', 'notices']);

const idOf = (e) => (e && e.item ? e.item.id : null);
const isOpenEntry = (e) => !!(e && e.item && !e.resolved);

/**
 * THE MAIL-CLIENT RULE (§9): the user resolved `resolvedId` (Done / Dismiss /
 * a reply that resolved it) from this window. The selection moves to the next
 * OPEN entry after it in display order, else the previous open entry before
 * it, else nothing (null). The resolved entry itself is skipped whatever it
 * says — the call is made before the store's broadcast arrives, while the
 * list still shows it open. An id the list does not hold ⇒ the first open
 * entry (or null).
 */
export function nextSelection(entries, resolvedId) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.item);
  const at = list.findIndex((e) => idOf(e) === resolvedId);
  if (at < 0) { const first = list.find(isOpenEntry); return first ? idOf(first) : null; }
  for (let k = at + 1; k < list.length; k++) if (isOpenEntry(list[k]) && idOf(list[k]) !== resolvedId) return idOf(list[k]);
  for (let k = at - 1; k >= 0; k--) if (isOpenEntry(list[k]) && idOf(list[k]) !== resolvedId) return idOf(list[k]);
  return null;
}

/**
 * What stays selected when the list changes under the selection (a broadcast,
 * the filter, a tab, the scope): the same id while the list still shows it —
 * open OR resolved in place (a row another client resolved stays readable,
 * dimmed: the selection never jumps away from what the user is reading) —
 * else the first OPEN entry, else null (a resolved row is never selected by
 * itself).
 */
export function holdSelection(entries, selectedId) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.item);
  if (selectedId != null && list.some((e) => idOf(e) === selectedId)) return selectedId;
  const first = list.find(isOpenEntry);
  return first ? idOf(first) : null;
}

/**
 * One pane or two. `width` = the window content's measured width in CSS px;
 * unmeasurable (0 / NaN — a minimized or display:none window) ⇒ null: keep
 * the mode you have (a hidden window must not flip to one pane and back).
 * `touch` (a coarse pointer) lifts every list row to TOUCH_ROW_PX.
 * @returns {{mode: 'single'|'split', rowMin: number}|null}
 */
export function paneMode(width, { touch = false } = {}) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return null;
  return { mode: w < NARROW_PX ? 'single' : 'split', rowMin: touch ? TOUCH_ROW_PX : 0 };
}

/** The text the filter searches when the caller does not word the item itself. */
const defaultText = (i) => [i.text, i.detail, i.sessionName, ...(Array.isArray(i.options) ? i.options : [])].filter((x) => typeof x === 'string').join('\n');

/**
 * The rows the left pane lists, in the order given:
 *   tab        'actions' ⇒ entries NOT marked `notice`; 'notices' ⇒ only those;
 *              anything else ⇒ both
 *   sessionKey a key or a list of keys (one session answers for its
 *              `<backend>:<id>` AND `webui:<id>` keys); empty ⇒ every session
 *   query      whitespace-separated terms, case-insensitive, EVERY term must
 *              appear in `textOf(item, entry)` (the caller words it — the
 *              device's own t() words of an i18n item, the session name)
 */
export function scopeRows(entries, { sessionKey = null, query = '', tab = null, textOf = null } = {}) {
  const keys = Array.isArray(sessionKey) ? sessionKey.filter((k) => typeof k === 'string' && k) : (typeof sessionKey === 'string' && sessionKey ? [sessionKey] : []);
  const ks = new Set(keys);
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const words = typeof textOf === 'function' ? textOf : (i) => defaultText(i);
  return (Array.isArray(entries) ? entries : []).filter((e) => {
    if (!e || !e.item) return false;
    if (tab === 'actions' && e.notice) return false;
    if (tab === 'notices' && !e.notice) return false;
    if (ks.size && !ks.has(e.item.sessionKey)) return false;
    if (terms.length) {
      const hay = String(words(e.item, e) || '').toLowerCase();
      if (!terms.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/**
 * THE LIST ROW'S CUT FORM of a detail: its first non-blank line with the
 * markdown marks a reader should not see in a one-liner dropped (`**`,
 * backticks, `__` only where it OPENS or CLOSES an emphasis — at a word's edge;
 * a `__` inside an identifier such as `window.__xss` stays, and a lone `_` or
 * `*` inside a word stays: snake_case is words — and a leading heading / quote
 * / list / numbered mark), cut at `max` with an ellipsis.
 * The pane shows the whole text; this is only the row's hint.
 */
export function rowPreview(detail, max = 160) {
  const line = String(detail || '').split('\n').find((l) => l.trim()) || '';
  const plain = line.replace(/\*\*|`/g, '').replace(/(^|[\s(])__(?=\S)|(?<=\S)__(?=[\s).,;:!?]|$)/g, '$1').replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/, '').trim();
  return plain.length > max ? plain.slice(0, Math.max(0, max - 1)).trimEnd() + '…' : plain;
}

const URGENCIES = ['low', 'normal', 'high', 'urgent'];

/**
 * THE ITEM PANE AS STRUCTURE. `ctx` (every word injected, so the rules are a
 * table and the window only paints):
 *   t, words (the item's title as the device words it), detail, name (the
 *   session's display name), origin ({origin, label} — the producer, label an
 *   English t() key), notice (bool), resolved (bool — the entry's view, which
 *   may lead the item's own status by a broadcast), reply ({show, enabled,
 *   why, code} — replyButtonState), ago(ts), expires(ts), resolvedBy(by),
 *   detailState ('whole' | 'loading' | 'failed' — a resolved item's snapshot
 *   carries a 300-char preview; the window loads the rest) + loadError.
 * Returns {id, sessionKey, title, detail, name, urgency, notice, resolved,
 *   status, meta:[{kind, text}], replied, options:[{idx, label}],
 *   reply:{show, enabled, why}, actions:[id…], producer, copy,
 *   cut: null | {state:'loading'|'failed', text}} (the sentence under a
 *   detail that is not yet whole — never silent).
 *   actions: open ⇒ reply? (only with a reply surface) · done · dismiss ·
 *   copy · producer?; resolved ⇒ reopen · copy. The reply box, the chips and
 *   the producer's button exist only while the item is OPEN (a resolved item
 *   is reopened first, the popup's rule).
 */
export function itemView(item, ctx = {}) {
  const t = typeof ctx.t === 'function' ? ctx.t : (s) => s;
  const i = item || {};
  const resolved = !!ctx.resolved || (typeof i.status === 'string' && i.status !== 'open');
  const notice = !!ctx.notice;
  const urgency = URGENCIES.includes(i.urgency) ? i.urgency : 'normal';
  const meta = [];
  if (resolved) {
    const by = typeof ctx.resolvedBy === 'function' ? ctx.resolvedBy(i.resolvedBy, i) : '';
    meta.push({ kind: 'status', text: i.status === 'dismissed' ? t('dismissed') : t('done') });
    if (by) meta.push({ kind: 'by', text: by });
  } else {
    meta.push({ kind: notice ? 'notice' : 'urgency', text: notice ? t('notice') : t(urgency) });
  }
  if (typeof ctx.ago === 'function' && Number.isFinite(i.createdAt)) meta.push({ kind: 'age', text: ctx.ago(i.createdAt) });
  if (!resolved && typeof ctx.expires === 'function') { const ex = ctx.expires(i.expiresAt); if (ex) meta.push({ kind: 'expires', text: ex }); }
  if (resolved && typeof ctx.ago === 'function' && Number.isFinite(i.resolvedAt)) meta.push({ kind: 'resolved-at', text: ctx.ago(i.resolvedAt) });
  if (ctx.origin && ctx.origin.label) meta.push({ kind: 'origin', text: t(ctx.origin.label) });
  // THE REPLY SURFACE: `why` is the one sentence the pane shows under it — a
  // drawn-but-disabled box says why it is disabled; an item with NO box says
  // where it is answered instead (a helper's card, the job panel) — except an
  // item that is not from an agent session at all (`no_session`: a login /
  // spend notice), where "nothing to reply to" would be noise on every pane.
  const rs = ctx.reply && typeof ctx.reply === 'object' ? ctx.reply : { show: false, enabled: false, why: '' };
  // design 009: an app install's ONE card — TWO buttons by its state (Install / Not now · Try again · Open once installed);
  // Reply, Mark done, Ignore, Copy and Clear content… behind its ⋯ (Reply opens the box only when asked for there)
  const card = i.action && i.action.type === 'app-install' && i.card && typeof i.card === 'object' ? i.card : null;
  const cardOpen = !!(card && card.state === 'done' && card.result && Array.isArray(card.result.rows) && card.result.rows.some((r) => r && r.id));
  const reply = card && !ctx.replyOpen ? { show: false, enabled: false, why: '' } : resolved ? { show: false, enabled: false, why: '' }
    : rs.show ? { show: true, enabled: !!rs.enabled, why: rs.enabled ? '' : String(rs.why || '') }
    : { show: false, enabled: false, why: rs.code && rs.code !== 'no_session' ? String(rs.why || '') : '' };
  const options = !resolved && reply.show && Array.isArray(i.options) ? i.options.map((label, idx) => ({ idx, label: String(label) })) : [];
  const producer = !resolved && i.action && i.action.type === 'reset-credit' && i.action.accountKey
    ? { type: 'reset-credit', accountKey: i.action.accountKey, sessionId: i.action.sessionId || null } : null;
  // lane-pairing ⑥: an exit's "ask me each time" item is answered HERE — Allow / Deny first (never a producer button)
  const exitAsk = !resolved && i.action && i.action.type === 'exit-run-ask' && i.action.askId ? { askId: i.action.askId, cmd: String(i.action.cmd || '') } : null;
  // lane browser-propose: the agent's browser proposal is answered HERE too — Approve / Reject first (the plan is the detail)
  const proposal = !resolved && i.action && (i.action.type === 'browser-proposal' || i.action.type === 'channel-watch-request') && i.action.id ? { id: i.action.id, shown: String(i.action.shown || '') } : null;   // lane channel-agent-watch: an agent's wake request too
  // Layer 0 apps: an agent's install proposal — Install… (THE install dialog, the plan first) / Not now, answered here too
  const appAsk = !resolved && i.action && i.action.type === 'app-install' && i.action.id ? { id: i.action.id, host: i.action.host || 'local' } : null;
  const cardActs = !card ? null : resolved ? [...(cardOpen ? ['app-open'] : []), 'reopen', 'copy']
    : card.state === 'installing' ? ['more'] : card.state === 'failed' ? ['app-retry', 'more'] : card.state === 'done' ? [...(cardOpen ? ['app-open'] : []), 'more'] : ['app-install', 'app-reject', 'more'];
  const actions = resolved ? ['reopen', 'copy'] : [...(exitAsk ? ['exit-allow', 'exit-deny'] : []), ...(proposal ? ['proposal-approve', 'proposal-reject'] : []), ...(appAsk ? ['app-install', 'app-reject'] : []), ...(reply.show ? ['reply'] : []), 'done', 'dismiss', 'copy', ...(producer ? ['producer'] : [])];
  const title = String(ctx.words != null ? ctx.words : (i.text || ''));
  const detail = String(ctx.detail != null ? ctx.detail : (i.detail || ''));
  const replied = i.reply && typeof i.reply.text === 'string' && i.reply.text ? i.reply.text : null;
  const copy = title + (detail ? '\n\n' + detail : '') + (replied ? '\n\n---\n\n' + t('You replied: {text}', { text: replied }) : '');
  // THE CUT SENTENCE: a detail that is a preview says so while the rest loads, and names the
  // reason when it could not be loaded — the pane never shows 300 chars as if they were all
  const state = ctx.detailState === 'loading' || ctx.detailState === 'failed' ? ctx.detailState : 'whole';
  const cut = state === 'whole' ? null
    : state === 'loading' ? { state, text: t('Showing the first {n} characters — loading the rest…', { n: detail.length }) }
    : { state, text: t('Could not load the rest of the text: {why}', { why: String(ctx.loadError || '') }) };
  return {
    id: i.id || null, sessionKey: i.sessionKey || null, title, detail, name: String(ctx.name || ''),
    urgency: resolved || notice ? '' : urgency, notice, resolved, status: resolved ? (i.status === 'dismissed' ? 'dismissed' : 'done') : 'open',
    meta, replied, options, reply, actions: cardActs || actions, producer, exitAsk, proposal, appAsk, copy, cut,
  };
}
