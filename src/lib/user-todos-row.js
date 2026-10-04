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
import { cardWords, progressWords } from './app-card-model.js'; // design 009: THE words of an app install's one card (PURE)

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
 *  user's own inbox reply, design-user-inbox-reply D1.4). `item` = the
 *  resolved item, for a resolution worded with its fact ('resumed'). */
export function resolvedByText(by, t, item = null) {
  if (by === 'agent') return t('by the agent');
  if (by === 'system') return t('automatically');
  if (by === 'expired') return t('expired');
  if (by === 'reply') return t('by your reply');
  // lane-pairing ⑥: an exit's "ask me each time" item is resolved BY its outcome
  if (by === 'allowed') return t('allowed');
  if (by === 'denied') return t('denied');
  if (by === 'revoked') return t('access removed');
  if (by === 'ask-expired') return t('expired (no answer in 60 s)');
  if (by === 'ask-changed') return t('not run — it changed after it was shown'); // verify-r6 W1
  if (by === 'ask-over') return t('this request is over — the agent can ask again'); // verify-r6 W2: a reopened ask that is over
  if (by === 'conversation-gone') return t('the conversation ended before you answered');
  // lane exit-item-heal: an unexpected-exit item answered by the conversation running again (its new session's start, this device's clock)
  if (by === 'resumed') {
    const at = item && item.resolvedFact && Number(item.resolvedFact.resumedAt);
    if (!at) return t('running again');
    const d = new Date(at);
    return t('running again (resumed {time})', { time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') });
  }
  return by && by !== 'user' ? by : '';
}

const REPLY_SNIPPET = 80; // chars of "You replied: …" on a resolved row (the For-you window shows the whole reply)

// A PRODUCER'S ACTION (design-reset-credits p2): an item that carries `action`
// gets ONE button doing it — the client maps the TYPE to a verb it owns.
const actionBtnHtml = (i, t) => (i && i.action && i.action.type === 'reset-credit' && i.action.accountKey
  ? `<button class="ut-act ut-action-reset" title="${escHtml(t('Use a reset credit…'))}">${UI_ICONS.refresh || ''}</button>` : '');
/** The command an exit ask names, in mono, then its ANSWER — Allow / Deny on their own line — and the rule (open items
 *  only). lane-pairing ⑥: answered right here (the popup, the mini inbox and the phone paint this row). naive-user
 *  N-ask: the two buttons rode the floated `.ut-actions` bar — at 35 % opacity until the row is hovered (a 60-second
 *  decision whose Allow read as disabled) and, on the phone, six 36-px buttons wide, crushing the question into a
 *  one-word column ("Sessi / on 2"). */
// verify-r4 F4: THE WHOLE COMMAND, as it runs — the item's `detail` (exit-proxy files the whole command there; the
// store keeps 8 000 chars, a command is ≤ 4 096 bytes), line breaks kept, ALL of it above Allow (no inner scroll box —
// a macOS overlay scrollbar is invisible until scrolled, so a clipped box reads as the whole command). Pre-fix the row showed
// `action.cmd` — the head cut at 120 characters with every line break turned into a space — clipped to three lines
// (overflow hidden, no mark), with the whole command in a collapsed "detail" BELOW Allow: a three-line command whose
// last line was `curl … | sh` read "echo … curl" above an Allow button (reproduced).
const exitCmdOf = (i) => (i && typeof i.detail === 'string' && i.detail ? i.detail : String((i && i.action && i.action.cmd) || ''));
const exitAskHtml = (i, t) => (i && i.action && i.action.type === 'exit-run-ask'
  ? `<pre class="ut-exit-cmd">${escHtml(exitCmdOf(i))}</pre>`
    + (i.action.askId ? `<div class="ut-exit-answer"><button type="button" class="ut-act ut-action-exit ut-exit-allow" data-answer="allow">${escHtml(t('Allow'))}</button><button type="button" class="ut-act ut-action-exit ut-exit-deny" data-answer="deny">${escHtml(t('Deny'))}</button></div>` : '')
    + `<div class="ut-exit-note">${escHtml(t('Nothing runs until you answer. After 60 s it is refused.'))}</div>` : '');

/** lane browser-propose (2026-09-30): the agent's PROPOSAL, answered where it appears — its words (the card's, line for
 *  line: what Approve runs) ABOVE Approve / Reject, never folded (the exit-ask lesson: a folded detail below the button
 *  read as the whole story). ONE primary (Approve), a quiet Reject; open items only. */
const PROPOSAL_ACTIONS = ['browser-proposal', 'channel-watch-request'];   // lane channel-agent-watch: an agent's wake request is answered the same way
const proposalAskHtml = (i, t, detail) => (i && i.action && PROPOSAL_ACTIONS.includes(i.action.type)
  ? `<div class="ut-proposal-plan">${escHtml(detail || '')}</div>`
    + (i.action.id ? `<div class="ut-exit-answer ut-proposal-answer"><button type="button" class="ut-act ut-action-proposal ut-proposal-approve" data-answer="approve" title="${escHtml(t('Runs exactly what this card says'))}">${escHtml(t('Approve'))}</button><button type="button" class="ut-act ut-action-proposal ut-proposal-reject" data-answer="reject">${escHtml(t('Reject'))}</button></div>` : '') : '');

/** Layer 0 apps (docs/design-app-persistence.zh.md §3.1): an agent's install PROPOSAL, answered where it appears — Install…
 *  opens THE install dialog on the proposal (its fresh plan: every command, the packages, the sizes — nothing runs before
 *  the press there), Not now declines it (the agent is told on its next turn); open items only. */
const appAskHtml = (i, t) => (i && i.action && i.action.type === 'app-install' && i.action.id
  ? `<div class="ut-exit-answer ut-app-answer"><button type="button" class="ut-act ut-action-app ut-app-install" data-answer="install" title="${escHtml(t('Shows the plan first — nothing runs until you confirm'))}">${escHtml(t('Install…'))}</button><button type="button" class="ut-act ut-action-app ut-app-reject" data-answer="reject">${escHtml(t('Not now'))}</button></div>` : '');

/** design 009 §2 A: an app install's ONE CARD — the engine's view (`item.card`, src/app-card.js) worded by
 *  app-card-model: who asks and why, where it comes from and how big, what the click gives; TWO buttons (Install / Not
 *  now — the click installs, nothing in between); the progress, Installed · Open and a failure's Try again in the same
 *  card; everything else in its Details fold. Every string escHtml'd (an app's name and an agent's why are peer text).
 *  `buttons: false` = the For-you window's pane (its buttons live in the pane's action row). */
const isAppCard = (i) => !!(i && i.action && i.action.type === 'app-install' && i.card && typeof i.card === 'object');
/** apps-joint r1 (F1): a download's icon is served from its proposal (lane apps-install-core) — the only other address a
 *  card's picture may have. */
const PROPOSAL_ICON_RE = /^\/api\/apps\/proposals\/ap-[0-9a-f]{6}\/icon$/;
export function appCardHtml(i, t, { lang = 'en', resolved = false, buttons = true } = {}) {
  const v = i.card;
  const w = cardWords(v, t, lang);
  const pg = progressWords(v, t);
  const line = (cls, s) => (s ? `<div class="ut-app-line ${cls}">${escHtml(s)}</div>` : '');
  const icon = v.app && typeof v.app.icon === 'string' && (v.app.icon.startsWith('/api/apps/icon?') || PROPOSAL_ICON_RE.test(v.app.icon)) ? `<img class="ut-app-icon" alt="" src="${escHtml(v.app.icon)}">` : '';
  let html = icon + line('ut-app-by', w.by) + line('ut-app-from', w.from) + line('ut-app-note', w.fromNote) + line('ut-app-gives', w.gives) + line('ut-app-first', w.firstUse) + line('ut-app-changed', w.changed);
  if (pg) {
    const acts = buttons ? pg.actions.map((a) => `<button type="button" class="ut-act ut-action-app ut-app-${a}" data-answer="${a}">${escHtml(a === 'open' ? t('Open') : t('Try again'))}</button>`).join('') : '';
    html += `<div class="ut-app-progress" data-kind="${pg.kind}">${pg.kind === 'busy' ? '<span class="ut-app-spin" aria-hidden="true"></span>' : ''}<span class="ut-app-progress-text">${escHtml(pg.text)}</span>${acts}</div>`;
  } else if (buttons && !resolved && v.state === 'proposed' && i.action.id) {
    html += `<div class="ut-exit-answer ut-app-answer"><button type="button" class="ut-act ut-action-app ut-app-install" data-answer="install">${escHtml(w.go)}</button><button type="button" class="ut-act ut-action-app ut-app-reject" data-answer="reject">${escHtml(w.later)}</button></div>`;
  }
  if (w.details.length) html += `<details class="ut-detail-exp ut-app-details"><summary>${escHtml(t('Details'))}</summary><div class="ut-app-detail">${w.details.map((d) => `<div class="ut-app-dline${d.mono ? ' ut-app-mono' : ''}">${escHtml(d.text)}</div>`).join('')}</div></details>`;
  return `<div class="ut-app-card" data-state="${escHtml(String(v.state || ''))}">${html}</div>`;
}

/** The static parts of a row for `entry` + the signature patchRow compares.
 *  The LIVE half (enabled / tooltip of the reply controls) is NOT in here —
 *  applyLive owns it, so a turn flip never rebuilds a row. */
function partsOf(entry, ctx) {
  const { t } = ctx;
  const i = entry.item;
  const resolved = !!entry.resolved;
  const notice = !!entry.notice && !resolved;
  const tail = !!entry.tail;
  // a CLEARED item ("Clear content…", 2026-09-28): its words are the cleared sentence (ctx.wordsOf) — dimmed, in its place
  const cls = 'ut-item' + (notice ? ' ut-item-notice' : '') + (resolved ? ' ut-item-resolved' : '') + (resolved && !tail ? ' ut-item-inplace' : '') + (i && i.clearedAt ? ' ut-item-cleared' : '');
  const card = isAppCard(i) ? i.card : null; // design 009: an app install's ONE card (a cleared item has none left)
  const lang = typeof ctx.lang === 'function' ? ctx.lang() : (ctx.lang || 'en');
  const words = card ? cardWords(card, t, lang).title : ctx.wordsOf(i);
  const detail = ctx.detailOf(i);
  const rs = !resolved && ctx.replyState ? ctx.replyState(i) : { show: false };
  const dot = resolved
    ? '<span class="ut-dot" data-urgency=""></span>'
    : `<span class="ut-dot" data-urgency="${notice ? '' : escHtml(i.urgency || 'normal')}" title="${escHtml(notice ? t('notice') : (i.urgency || 'normal'))}"></span>`;
  // Detail rides behind a collapsed expander (up to 2000 chars of agent context).
  // (an exit ask's detail IS its command — shown whole above its Allow / Deny, never again folded below them)
  const detailHtml = detail && !(i.action && i.action.type === 'exit-run-ask') ? `<details class="ut-detail-exp"><summary>${escHtml(t('detail'))}</summary><div class="ut-detail">${escHtml(detail)}</div></details>` : '';
  // lane browser-propose: an open proposal's words are shown whole ABOVE its Approve (proposalAskHtml) — never folded again below
  const detailFold = i && i.action && i.action.type === 'browser-proposal' && !resolved ? '' : detailHtml;
  // OPTION CHIPS (design-user-inbox-reply D3a): one click = a reply whose text
  // IS the label. Addressed by INDEX — the label never rides an attribute.
  const opts = !resolved && rs.show && Array.isArray(i.options) && i.options.length
    ? `<div class="ut-opts">${i.options.map((o, k) => `<button type="button" class="ut-opt" data-idx="${k}">${escHtml(o)}</button>`).join('')}</div>` : '';
  let meta;
  if (resolved) {
    const by = resolvedByText(i.resolvedBy, t, i);
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
  const body = `<div class="ut-text">${escHtml(words)}</div>${card ? appCardHtml(i, t, { lang, resolved }) : !resolved ? exitAskHtml(i, t) + proposalAskHtml(i, t, detail) + appAskHtml(i, t) : ''}${card ? '' : detailFold}${opts}<div class="ut-meta">${meta}</div>`;
  // ⤢ = THE For-you window ON this item (design-user-inbox-reply §9: long text at full width, reply / done there)
  const view = `<button class="ut-act ut-view" title="${escHtml(t('Open in the For-you window'))}" aria-label="${escHtml(t('Open in the For-you window'))}">⤢</button>`;
  // design 009: a card's Reply / Mark done / Ignore / Copy / Clear content… live behind its ⋯ (two buttons on its face)
  const more = `<button type="button" class="ut-act ut-more" title="${escHtml(t('More'))}" aria-label="${escHtml(t('More'))}">⋯</button>`;
  const actions = resolved
    ? `<span class="ut-actions">${view}<button class="ut-act ut-reopen" title="${escHtml(t('Reopen'))}">↺</button></span>`
    : card ? `<span class="ut-actions">${view}${more}</span>`
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
  const btn = el.querySelector(':scope > .ut-body > .ut-actions > .ut-reply-btn');
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
  // the actions FLOAT at the body's top-right (first child, CSS float) so the words
  // wrap beside them and then use the full width below — a sibling column reserved
  // the right third of every tall row for four buttons (owner 2026-09-25 screenshot)
  el.innerHTML = p.dot + `<div class="ut-body">${p.actions}${p.body}</div>`;
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
      el.innerHTML = p.dot + `<div class="ut-body">${p.actions}${p.body}</div>`;
      body = el.querySelector(':scope > .ut-body');
    } else {
      for (const c of [...el.children]) if (c !== body) c.remove();
      for (const c of [...body.children]) if (c !== keep) c.remove();
      const tmp = document.createElement('div');
      tmp.innerHTML = p.dot + `<div class="ut-body">${p.actions}${p.body}</div>`;
      const [dotEl, freshBody] = [...tmp.children];
      el.insertBefore(dotEl, body);
      keep.before(...freshBody.childNodes);
    }
    if (detailOpen) { const d = body.querySelector(':scope > .ut-detail-exp'); if (d) d.open = true; }
    el.dataset.sig = p.sig;
  }
  applyLive(el, entry.item, ctx);
  return el;
}

/** THE KEYED RECONCILER (design-user-inbox-reply D1.9; §9 shares it with the
 *  For-you window's list): bring `container`'s keyed children (after `head`,
 *  when given) to `entries`, in order. A child whose key is still listed is
 *  PATCHED (never replaced — a focused textarea on it keeps focus and text), a
 *  new one is created, a child no longer listed is removed, and a node MOVES
 *  only when it is out of place (never the common case while a layout is
 *  append-only — moving a focused textarea would blur it).
 *  opts = {head, isRow(el), keyOf(el), idOf(entry), create(entry), patch(el, entry)} */
export function reconcileKeyed(container, entries, { head = null, isRow, keyOf = (el) => el.dataset.id, idOf = (e) => e.item.id, create, patch }) {
  const existing = new Map();
  for (const c of container.children) if (isRow(c)) existing.set(keyOf(c), c);
  let prev = head;
  for (const e of entries) {
    const id = idOf(e);
    let row = existing.get(id);
    if (row) { patch(row, e); existing.delete(id); }
    else row = create(e);
    const slot = prev ? prev.nextElementSibling : container.firstElementChild;
    if (row !== slot) container.insertBefore(row, slot);
    prev = row;
  }
  for (const r of existing.values()) r.remove();
}
