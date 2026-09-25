// THE For-you row renderer (docs/design-user-inbox-reply.md chunk 2, 2026-09-23).
//
// ONE function draws every row the inbox shows — an open ask, a notice, a row
// resolved IN PLACE while the popup is open (inc-mtw02kbq-kj96), and a row of
// the "Recently resolved" tail — and ONE function patches an existing row to a
// new state. The panel (src/lib/user-todos-panel.js) reconciles keyed rows with
// these two, and chunk 3's per-window mini inbox reuses them (`ctx.mini`).
//
// Why a separate file: the popup used to re-render wholesale (`popup.innerHTML
// = …`) on every broadcast. That was fine while a row held only buttons; a row
// now holds a REPLY BOX the user types into, and one broadcast (another item
// filed, another client's ✓) would have swallowed the text and the focus. So:
//   renderRow(entry, ctx)       → a fresh `.ut-item[data-id]` element
//   patchRow(el, entry, ctx)    → the same element brought to `entry`; a
//                                 `.ut-reply` box on it is NEVER replaced
//                                 (its focus and its text survive)
//   applyLive(el, item, ctx)    → only the live half (reply button / option
//                                 chips / Send: enabled + tooltip) — the panel
//                                 calls it on every active-sessions broadcast
//                                 without touching anything else
//   replyBoxEl(t)               → the box (a one-line auto-growing textarea +
//                                 Send), inserted under the row's text
//
// XSS: every item string (title, detail, option labels, the session name, the
// reply) is a peer/user-controlled string synced to EVERY client — each one
// goes through escHtml here, and nothing else in this file builds markup.
//
// entry = {item, resolved, notice?, tail?}
// ctx   = {t, nameFor(key, items), wordsOf(item), detailOf(item),
//          replyState(item) → {show, enabled, why}, mini?}
import { escHtml } from './utils.js';
import { UI_ICONS } from './icons.js';

/** "3min ago" / "2h ago" / a date — words by the caller's t(). */
export function agoText(ts, t) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return t('just now');
  if (m < 60) return t('{m}min ago', { m });
  const h = Math.round(m / 60);
  return h < 24 ? t('{h}h ago', { h }) : new Date(ts).toLocaleDateString();
}
/** 2.369.152: a notice about a WINDOW carries the window's end (`expiresAt`). */
export function expiresText(ts, t) {
  if (!(typeof ts === 'number' && Number.isFinite(ts))) return '';
  const m = Math.ceil((ts - Date.now()) / 60000);
  if (m <= 0) return '';
  return m < 60 ? t('expires in {n} min', { n: m }) : t('expires in {n} h', { n: Math.round(m / 60) });
}
/** Who resolved it, in words ('expired' = the store's sweep, 'reply' = the
 *  user's own inbox reply, design-user-inbox-reply D1.4). */
export function resolvedByText(by, t) {
  if (by === 'agent') return t('by the agent');
  if (by === 'system') return t('automatically');
  if (by === 'expired') return t('expired');
  if (by === 'reply') return t('by your reply');
  return by && by !== 'user' ? by : '';
}

const REPLY_SNIPPET = 80; // chars of "You replied: …" on a resolved row (the viewer shows the whole reply)

// A PRODUCER'S ACTION (design-reset-credits p2): an item that carries `action`
// gets ONE button doing it — the client maps the TYPE to a verb it owns.
const actionBtnHtml = (i, t) => (i && i.action && i.action.type === 'reset-credit' && i.action.accountKey
  ? `<button class="ut-act ut-action-reset" title="${escHtml(t('Use a reset credit…'))}">${UI_ICONS.refresh || ''}</button>` : '');

/** The static parts of a row for `entry` + the signature patchRow compares.
 *  The LIVE half (enabled / tooltip of the reply controls) is NOT in here —
 *  applyLive owns it, so a turn flip never rebuilds a row. */
function partsOf(entry, ctx) {
  const { t } = ctx;
  const i = entry.item;
  const resolved = !!entry.resolved;
  const notice = !!entry.notice && !resolved;
  const tail = !!entry.tail;
  const cls = 'ut-item' + (notice ? ' ut-item-notice' : '') + (resolved ? ' ut-item-resolved' : '') + (resolved && !tail ? ' ut-item-inplace' : '');
  const words = ctx.wordsOf(i);
  const detail = ctx.detailOf(i);
  const rs = !resolved && ctx.replyState ? ctx.replyState(i) : { show: false };
  const dot = resolved
    ? '<span class="ut-dot" data-urgency=""></span>'
    : `<span class="ut-dot" data-urgency="${notice ? '' : escHtml(i.urgency || 'normal')}" title="${escHtml(notice ? t('notice') : (i.urgency || 'normal'))}"></span>`;
  // Detail rides behind a collapsed expander (up to 2000 chars of agent context).
  const detailHtml = detail ? `<details class="ut-detail-exp"><summary>${escHtml(t('detail'))}</summary><div class="ut-detail">${escHtml(detail)}</div></details>` : '';
  // OPTION CHIPS (design-user-inbox-reply D3a): one click = a reply whose text
  // IS the label. Addressed by INDEX — the label never rides an attribute.
  const opts = !resolved && rs.show && Array.isArray(i.options) && i.options.length
    ? `<div class="ut-opts">${i.options.map((o, k) => `<button type="button" class="ut-opt" data-idx="${k}">${escHtml(o)}</button>`).join('')}</div>` : '';
  let meta;
  if (resolved) {
    const by = resolvedByText(i.resolvedBy, t);
    const replied = i.reply && typeof i.reply.text === 'string' && i.reply.text
      ? ' · ' + escHtml(t('You replied: {text}', { text: i.reply.text.length > REPLY_SNIPPET ? i.reply.text.slice(0, REPLY_SNIPPET) + '…' : i.reply.text })) : '';
    meta = (tail ? `<span class="ut-sess" title="${escHtml(t('Go to this session'))}">${escHtml(ctx.nameFor(i.sessionKey, [i]))}</span> · ` : '')
      + escHtml(i.status === 'dismissed' ? t('dismissed') : t('done'))
      + (by ? ' · ' + escHtml(by) : '') + replied
      + (tail ? ' · ' + escHtml(agoText(i.resolvedAt || i.createdAt, t)) : '');
  } else {
    const exp = notice ? expiresText(i.expiresAt, t) : '';
    meta = (notice ? `<span class="ut-sess">${escHtml(ctx.nameFor(i.sessionKey, [i]))}</span> · ` : '')
      + escHtml(agoText(i.createdAt, t)) + (exp ? ' · ' + escHtml(exp) : '');
  }
  const body = `<div class="ut-text">${escHtml(words)}</div>${detailHtml}${opts}<div class="ut-meta">${meta}</div>`;
  const view = `<button class="ut-act ut-view" title="${escHtml(t('Open in viewer (copyable, rendered)'))}">⤢</button>`;
  const actions = resolved
    ? `<span class="ut-actions">${view}<button class="ut-act ut-reopen" title="${escHtml(t('Reopen'))}">↺</button></span>`
    : `<span class="ut-actions">${actionBtnHtml(i, t)}${rs.show ? `<button type="button" class="ut-act ut-reply-btn" title="${escHtml(t('Reply'))}">${UI_ICONS.reply}</button>` : ''}${view}`
      + `<button class="ut-act ut-done" title="${escHtml(t('Handled — mark done'))}">✓</button>`
      + `<button class="ut-act ut-dismiss" title="${escHtml(t('Dismiss (not going to act on this)'))}">✕</button></span>`;
  return { cls, dot, body, actions, sig: cls + '\u0000' + dot + '\u0000' + body + '\u0000' + actions };
}

/** The reply box (design-user-inbox-reply D3b): Enter sends, Shift+Enter is a
 *  newline, Esc folds — the panel owns those keys; this only builds it. */
export function replyBoxEl(t) {
  const box = document.createElement('div');
  box.className = 'ut-reply';
  const ta = document.createElement('textarea');
  ta.className = 'ut-reply-input';
  ta.rows = 1;
  ta.placeholder = t('Reply…');
  ta.setAttribute('aria-label', t('Reply'));
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'ut-act ut-reply-send';
  send.title = t('Send reply (Enter) · newline (Shift+Enter)');
  send.setAttribute('aria-label', send.title);
  send.innerHTML = UI_ICONS.send;
  box.append(ta, send);
  return box;
}

/** A box the user is USING: it has focus or text. Never replaced or removed by a repaint. */
export function boxInUse(box) {
  if (!box) return false;
  const ta = box.querySelector('textarea');
  return box.contains(document.activeElement) || !!(ta && ta.value);
}

/** The live half: the reply button, the chips and an open box's Send follow
 *  the verdict of the session's CURRENT facts (ctx.replyState). */
export function applyLive(el, item, ctx) {
  const { t } = ctx;
  const rs = ctx.replyState ? ctx.replyState(item) : { show: false, enabled: false, why: '' };
  const why = rs.enabled ? '' : t(rs.why || '');
  const btn = el.querySelector(':scope > .ut-actions > .ut-reply-btn');
  if (btn) {
    btn.disabled = !rs.enabled;
    btn.title = rs.enabled ? t('Reply') : why;
    btn.setAttribute('aria-label', btn.title);
  }
  const busy = el.dataset.sending === '1';
  el.querySelectorAll(':scope > .ut-body > .ut-opts > .ut-opt').forEach((c) => {
    const label = (Array.isArray(item.options) && item.options[Number(c.dataset.idx)]) || '';
    c.disabled = !rs.enabled || busy;
    c.title = rs.enabled ? t('Reply with "{label}"', { label }) : why;
  });
  const send = el.querySelector(':scope > .ut-body > .ut-reply > .ut-reply-send');
  // a box on a row that has since RESOLVED still sends (a reply to a resolved
  // item is accepted, D1.4) — only the session's liveness gates it
  if (send) {
    send.disabled = !rs.enabled || busy;
    send.title = rs.enabled ? t('Send reply (Enter) · newline (Shift+Enter)') : why;
    send.setAttribute('aria-label', send.title);
  }
}

/** A fresh row element for `entry`. */
export function renderRow(entry, ctx) {
  const el = document.createElement('div');
  el.dataset.id = entry.item.id;
  const p = partsOf(entry, ctx);
  el.className = p.cls;
  el.innerHTML = p.dot + `<div class="ut-body">${p.body}</div>` + p.actions;
  el.dataset.sig = p.sig;
  applyLive(el, entry.item, ctx);
  return el;
}

/** Bring `el` (a row renderRow built) to `entry`. Unchanged ⇒ only the live
 *  half is re-applied. Changed ⇒ the dot, the text/detail/chips/meta and the
 *  actions are replaced AROUND a reply box — the box node itself is never
 *  detached (detaching a focused textarea blurs it), so a user typing while a
 *  broadcast lands keeps the caret and every character. An open detail stays open. */
export function patchRow(el, entry, ctx) {
  const p = partsOf(entry, ctx);
  if (el.dataset.sig !== p.sig) {
    const detailOpen = !!el.querySelector(':scope > .ut-body > .ut-detail-exp[open]');
    let body = el.querySelector(':scope > .ut-body');
    const box = body && body.querySelector(':scope > .ut-reply');
    // an open row keeps its box; a resolved row keeps it only while in use
    const keep = box && (!entry.resolved || boxInUse(box)) ? box : null;
    el.className = p.cls;
    if (!keep) {
      el.innerHTML = p.dot + `<div class="ut-body">${p.body}</div>` + p.actions;
      body = el.querySelector(':scope > .ut-body');
    } else {
      for (const c of [...el.children]) if (c !== body) c.remove();
      for (const c of [...body.children]) if (c !== keep) c.remove();
      const tmp = document.createElement('div');
      tmp.innerHTML = p.dot + `<div class="ut-body">${p.body}</div>` + p.actions;
      const [dotEl, freshBody, actionsEl] = [...tmp.children];
      el.insertBefore(dotEl, body);
      keep.before(...freshBody.childNodes);
      el.append(actionsEl);
    }
    if (detailOpen) { const d = body.querySelector(':scope > .ut-detail-exp'); if (d) d.open = true; }
    el.dataset.sig = p.sig;
  }
  applyLive(el, entry.item, ctx);
  return el;
}
