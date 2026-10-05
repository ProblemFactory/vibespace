// THE For-you WINDOW (docs/design-user-inbox-reply.md §9, 2026-09-27).
//
// The owner: "有时候agent给我发好几条很长的消息，在这么小的面板很难review，给我做一个对长文本更友好
// 的"展开详情"面板吧，可以打开一个独立窗口来查看和处理这个inbox里的消息。" — the popup (and the
// title-bar mini inbox) cut a long item after a few lines behind a "▸ detail" expander in a
// ~400 px panel. This window is a MAIL CLIENT over the same inbox:
//   LEFT  the list — the SAME entries the popup shows (the PURE user-todos-layout.js order:
//         sortGroups → openLayout on open, nextLayout on every broadcast — a row resolved
//         here keeps its slot, dimmed, until the next open), two tabs (Actions | Notices)
//         with the popup's counts, a scope (All sessions | the session you are reading) and
//         a text filter (PURE scopeRows); rows keyed and patched in place (reconcileKeyed)
//   RIGHT the item at FULL WIDTH — its title and detail rendered as markdown (every byte is
//         agent-controlled: raw HTML in it is ESCAPED by the renderer, then sanitizeHtml), its
//         option chips, a multi-line reply box, and the action row (Reply · Mark done ·
//         Dismiss · Reopen · Copy · the producer's action) — every verb THE model's
//         (src/lib/user-todos-actions.js), the same routes the popup calls
// After THIS client resolves the selected item the selection moves to the next open one
// (PURE nextSelection, the mail-client rule); keyboard ↑/↓ j/k · Enter · Esc ·
// Ctrl/Cmd+Enter; below NARROW_PX (PURE paneMode) one pane at a time with a ‹ back.
// A registered window type (`inbox`, singleton), so layout restore, cross-client sync,
// desktops, tab groups and the taskbar work for free; `app.openInbox({itemId, sessionKey})`
// is THE door (the popup's ⤢, a row's ⤢, the mini inbox's ⤢, ⚙ Communication ▸ For you…).
import { t, tc, resolveLang } from './i18n.js';
import { cardWords } from './app-card-model.js'; // design 009: THE words of an app install's one card
import { Marked } from 'marked';
import { sanitizeHtml } from './safe-html.js';
import { copyText, escHtml, showContextMenu, showToast } from './utils.js';
import { UI_ICONS } from './icons.js';
import { pressVerdict } from './press-arm.js'; // verify-r6 V1: an Allow counts only once its pane has been shown ARM_MS
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
import { inboxModel, actionWords } from './user-todos-actions.js'; // THE store + the verbs (one implementation with the popup)
import { sortGroups, openLayout, nextLayout, entriesFor, splitNotices, isNotice, noticeGroups, tabCounts, originOf, ORIGIN_LABELS } from './user-todos-layout.js'; // PURE: the popup's order, notices, counts
import { reconcileKeyed, agoText, expiresText, resolvedByText, appCardHtml } from './user-todos-row.js'; // THE keyed reconciler + the row words
import { TABS, nextSelection, holdSelection, paneMode, scopeRows, rowPreview, itemView } from './inbox-window-layout.js'; // PURE: the window's rules (test-inbox-window-model)

// The taskbar For-you button's own glyph (UI_ICONS.inbox's paths), in the registry's 16px chrome.
const ICON = svgIcon16('<path d="M2 9.5h3l1 1.8h4l1-1.8h3"/><path d="M3.5 3.5h9l1.5 6v3.5a1 1 0 01-1 1H3a1 1 0 01-1-1V9.5z"/>');

// MARKDOWN FOR AGENT TEXT: an item's title/detail/reply are written by an agent
// (or a peer) and sync to EVERY client. Raw HTML inside them is not markup here:
// this renderer ESCAPES every html token (so `<img onerror=…>` reads as the text
// it is), and the output still goes through sanitizeHtml (src/lib/safe-html.js, the house rule). A private
// Marked instance — the chat's global `marked` keeps its own options.
const md = new Marked({ gfm: true, breaks: true, renderer: { html(h) { return escHtml(typeof h === 'string' ? h : (h && h.text) || ''); } } });
function mdInto(el, src, { inline = false } = {}) {
  const s = String(src || '');
  el.innerHTML = sanitizeHtml(inline ? md.parseInline(s) : md.parse(s));
  // a link opens beside the workspace, never in place of it
  for (const a of el.querySelectorAll('a[href]')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const TAB_SEG = { urgent: 'ut-seg-urgent', high: 'ut-seg-high', normal: 'ut-seg-norm', low: 'ut-seg-norm' };
const tabWord = (tab) => (tab === 'notices' ? t('Notices') : tc('inbox', 'Actions'));

/**
 * Open (or reveal) THE For-you window. `itemId` = select that item (its tab
 * follows it), `sessionKey` = scope the list to that session. A replay
 * (`syncId`, another client's layout) builds the window from its spec and
 * never re-points an open one.
 */
export function openInboxWindow(app, { itemId = null, sessionKey = null, syncId } = {}) {
  for (const [id, w] of app.wm.windows || []) {
    if (w && w.type === 'inbox') {
      app.wm.revealWindow(id, { replay: !!syncId });
      if (!syncId && w._inbox) w._inbox.show({ itemId, sessionKey });
      return w;
    }
  }
  app._hideWelcome?.();
  const spec = { action: 'openInbox' };
  if (itemId) spec.itemId = String(itemId);
  if (sessionKey) spec.sessionKey = String(sessionKey);
  const winInfo = app.wm.createWindow({ title: t('For you'), type: 'inbox', syncId, openSpec: spec, width: 920, height: 640 });
  const signal = winInfo._listenerCtl?.signal;
  const model = inboxModel(app);

  // ── the skeleton (built once) ──
  const root = mk('div', 'iw');
  root.dataset.view = 'list';
  const bar = mk('div', 'iw-bar');
  const tabs = mk('div', 'iw-tabs');
  tabs.setAttribute('role', 'tablist');
  for (const tab of TABS) {
    const b = mk('button', 'iw-tab');
    b.type = 'button';
    b.dataset.tab = tab;
    b.setAttribute('role', 'tab');
    b.append(mk('span', 'iw-tab-label', tabWord(tab)));
    for (const k of tab === 'actions' ? ['action'] : ['notice']) { const n = mk('span', 'ut-count iw-tab-n'); n.dataset.n = k; n.style.display = 'none'; b.append(n); }
    tabs.append(b);
  }
  const scope = mk('div', 'iw-scope');
  scope.setAttribute('role', 'group');
  scope.setAttribute('aria-label', t('Sessions'));
  const scopeAll = mk('button', 'iw-scope-btn', t('All sessions'));
  scopeAll.type = 'button'; scopeAll.dataset.scope = 'all';
  const scopeOne = mk('button', 'iw-scope-btn iw-scope-one');
  scopeOne.type = 'button'; scopeOne.dataset.scope = 'one';
  scope.append(scopeAll, scopeOne);
  const filter = mk('input', 'iw-filter');
  filter.type = 'search';
  filter.placeholder = t('Filter…');
  filter.setAttribute('aria-label', t('Filter…'));
  bar.append(tabs, scope, filter);
  const body = mk('div', 'iw-body');
  const list = mk('div', 'iw-list');
  list.tabIndex = 0;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('For you'));
  const groupsBox = mk('div', 'iw-groups');
  const listEmpty = mk('div', 'empty-hint iw-list-empty');
  const tail = mk('div', 'iw-tail');
  const tailHead = mk('button', 'iw-tail-head');
  tailHead.type = 'button';
  const tailRows = mk('div', 'iw-tail-rows');
  tail.append(tailHead, tailRows);
  list.append(groupsBox, listEmpty, tail);
  const pane = mk('div', 'iw-pane');
  pane.tabIndex = -1;
  const paneBar = mk('div', 'iw-pane-bar');
  const back = mk('button', 'iw-back', '‹');
  back.type = 'button';
  back.title = t('Back');
  back.setAttribute('aria-label', t('Back'));
  paneBar.append(back);
  const paneNone = mk('div', 'empty-hint iw-none');
  pane.append(paneBar, paneNone);
  body.append(list, pane);
  root.append(bar, body);
  winInfo.content.appendChild(root);

  // ── state (PER CLIENT: the selection is this device's, the window syncs like any window) ──
  const st = {
    tab: 'actions', scopeKey: sessionKey || null, query: '', selected: null, pendingItem: itemId || null,
    layout: null, noticeOrder: null, tailOpen: false, display: [], mode: 'split', rowMin: 0, cur: null,
    tailIds: new Set(), // the resolved tail's ids of the last render (the tail head must still close while one is selected)
    loadErr: null,      // {id, why} — a previewed detail whose rest could not be loaded (the pane says so)
  };

  const textOf = (i) => [model.wordsOf(i), model.detailOf(i), model.nameFor(i.sessionKey, [i]), ...(Array.isArray(i.options) ? i.options : [])].join('\n');

  /** The item a door asked for: its tab follows it, the scope widens if it is outside it, the filter clears. */
  const applyPending = () => {
    const id = st.pendingItem;
    if (!id || !model.loaded) return;
    st.pendingItem = null;
    const it = model.byId(id);
    if (!it) return;
    st.tab = isNotice(it) ? 'notices' : 'actions';
    if (st.scopeKey && !model.keysFor(st.scopeKey).includes(it.sessionKey)) st.scopeKey = null;
    if (st.query) { st.query = ''; filter.value = ''; }
    st.selected = id;
    if (it.status !== 'open' && !(st.layout && st.layout.groups.some((g) => g.ids.includes(id)))) st.tailOpen = true; // a resolved item lives in the tail
    if (st.mode === 'single') root.dataset.view = 'item';
  };

  // ── the list ──
  const rowSig = (e) => {
    const i = e.item;
    const words = model.wordsOf(i);
    const sub = rowPreview(model.detailOf(i), 160); // the CUT form — the pane has the whole text
    const bits = [];
    if (!st.scopeKey || e.notice || e.tail) bits.push(model.nameFor(i.sessionKey, [i]));
    bits.push(agoText(e.resolved ? (i.resolvedAt || i.createdAt) : i.createdAt, t));
    if (e.resolved) bits.push(i.status === 'dismissed' ? t('dismissed') : t('done'));
    else if (Array.isArray(i.options) && i.options.length) bits.push(t('{n} options', { n: i.options.length }));
    const urg = e.resolved ? '' : (e.notice ? 'notice' : (i.urgency || 'normal'));
    return { words, sub, meta: bits.join(' · '), urg, sig: [words, sub, bits.join('\u0001'), urg, e.resolved ? 1 : 0].join('\u0000') };
  };
  const patchListRow = (el, e) => {
    const p = rowSig(e);
    const on = e.item.id === st.selected;
    const cls = 'iw-row' + (e.resolved ? ' iw-row-resolved' : '') + (e.notice ? ' iw-row-notice' : '') + (e.item.clearedAt ? ' iw-row-cleared' : '') + (on ? ' on' : '');
    if (el.className !== cls) el.className = cls;
    if (el.dataset.sig !== p.sig) {
      el.replaceChildren();
      const dot = mk('span', 'ut-dot');
      dot.dataset.urgency = p.urg === 'notice' ? '' : p.urg;
      const b = mk('div', 'iw-row-body');
      b.append(mk('div', 'iw-row-title', p.words));
      if (p.sub) b.append(mk('div', 'iw-row-sub', p.sub));
      b.append(mk('div', 'iw-row-meta', p.meta));
      el.append(dot, b);
      el.dataset.sig = p.sig;
    }
    if (el.getAttribute('aria-selected') !== String(on)) el.setAttribute('aria-selected', String(on));
  };
  const listRow = (e) => {
    const el = mk('div', 'iw-row');
    el.dataset.id = e.item.id;
    el.setAttribute('role', 'option');
    el.id = `iw-row-${e.item.id}`; // aria-activedescendant target (an id minted by the store: ut-<hex>)
    patchListRow(el, e);
    return el;
  };
  const reconcileList = (box, entries, head) => reconcileKeyed(box, entries, {
    head, isRow: (c) => c.classList.contains('iw-row'), create: listRow, patch: patchListRow,
  });
  const groupEl = (key) => {
    const g = mk('div', 'iw-group');
    g.dataset.key = key;
    const head = mk('div', 'iw-group-head');
    if (st.tab === 'actions' && key.includes(':')) { const dot = mk('span', 'ut-live-dot'); dot.dataset.key = key; dot.setAttribute('role', 'img'); head.append(dot); }
    head.append(mk('span', 'iw-group-name'), mk('span', 'iw-group-n'));
    g.append(head);
    return g;
  };

  // ── the tab counts (the popup's: tabCounts over the open items IN SCOPE — All = the popup's numbers) ──
  const setCount = (span, n, seg, title) => {
    const disp = n > 0 ? '' : 'none';
    if (span.style.display !== disp) span.style.display = disp;
    const txt = n > 0 ? String(n) : '';
    if (span.textContent !== txt) span.textContent = txt;
    const cls = 'ut-count iw-tab-n ' + seg;
    if (span.className !== cls) span.className = cls;
    if (span.title !== title) span.title = title;
  };
  const patchTabs = (openInScope) => {
    const c = tabCounts(openInScope, [], 0);
    for (const b of tabs.children) {
      const on = b.dataset.tab === st.tab;
      if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
      if (b.getAttribute('aria-selected') !== String(on)) b.setAttribute('aria-selected', String(on));
      if (b.dataset.tab === 'actions') {
        const words = actionWords(openInScope.filter((i) => !isNotice(i)));
        setCount(b.querySelector('[data-n="action"]'), c.inbox.action, TAB_SEG[c.inbox.urgency] || 'ut-seg-norm', c.inbox.action ? words : '');
        const label = tabWord('actions') + (c.inbox.action ? ', ' + words : '');
        if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
      } else {
        const nWords = t('{n} notices (for your information)', { n: c.inbox.notice });
        setCount(b.querySelector('[data-n="notice"]'), c.inbox.notice, 'ut-seg-notice', c.inbox.notice ? nWords : '');
        const label = tabWord('notices') + (c.inbox.notice ? ', ' + nWords : '');
        if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
      }
    }
  };
  const patchScope = () => {
    const sel = st.selected ? model.byId(st.selected) : null;
    // the candidate is a SESSION (or Background Work) — an instance-level key (`accounts`: a spend
    // or login notice) has no session to scope to, and its first item's name ("Spending") would
    // label a button that scopes every account-level notice (verify round)
    const selKey = sel && typeof sel.sessionKey === 'string' && (sel.sessionKey.includes(':') || sel.sessionKey === 'jobs') ? sel.sessionKey : null;
    const cand = st.scopeKey || selKey;
    const allOn = !st.scopeKey;
    if (scopeAll.classList.contains('on') !== allOn) scopeAll.classList.toggle('on', allOn);
    scopeAll.setAttribute('aria-pressed', String(allOn));
    if (!cand) { if (scopeOne.style.display !== 'none') scopeOne.style.display = 'none'; scopeOne.dataset.key = ''; return; }
    if (scopeOne.style.display) scopeOne.style.display = '';
    const name = model.nameFor(cand, sel && sel.sessionKey === cand ? [sel] : []); // TEXT — a session name is user/peer-controlled
    if (scopeOne.textContent !== name) scopeOne.textContent = name;
    scopeOne.dataset.key = cand;
    const title = t('Only this session: {name}', { name });
    if (scopeOne.title !== title) scopeOne.title = title;
    scopeOne.classList.toggle('on', !allOn);
    scopeOne.setAttribute('aria-pressed', String(!allOn));
  };

  // ── the item pane (keyed by the selected id; patched in place — a reply being typed survives every broadcast) ──
  const buildItem = (id) => {
    const el = mk('div', 'iw-item');
    el.dataset.id = id;
    const head = mk('div', 'iw-item-head');
    const dot = mk('span', 'ut-dot');
    const sess = mk('button', 'iw-sess');
    sess.type = 'button';
    sess.title = t('Go to this session');
    const ld = mk('span', 'ut-live-dot');
    ld.setAttribute('role', 'img');
    const nm = mk('span', 'iw-sess-name');
    const board = mk('span', 'ut-board iw-board');
    sess.append(ld, nm, board);
    const meta = mk('div', 'iw-meta');
    head.append(dot, sess, meta);
    const title = mk('div', 'iw-title');
    const detail = mk('div', 'iw-detail');
    const replied = mk('div', 'iw-replied');
    const cutLine = mk('div', 'iw-detail-cut'); // "showing the first N characters — loading the rest…" / the load's failure, by name
    const opts = mk('div', 'iw-opts');
    const reply = mk('div', 'iw-reply');
    const ta = mk('textarea', 'iw-reply-input');
    ta.rows = 3;
    ta.placeholder = t('Reply…');
    ta.setAttribute('aria-label', t('Reply'));
    ta.value = model.drafts.get(id) || '';
    const why = mk('div', 'iw-reply-why');
    reply.append(ta, why);
    const actions = mk('div', 'iw-actions');
    el.append(head, title, detail, cutLine, replied, opts, reply, actions);
    return { el, id, dot, sess, ld, nm, board, meta, title, detail, cutLine, replied, opts, reply, ta, why, actions, sig: {} };
  };
  /** A previewed detail (a resolved item's snapshot carries 300 chars): load the rest ONCE
   *  through the model; a failure lands on the pane as its sentence, never silently. */
  const loadDetail = (id) => {
    if (st.loadErr && st.loadErr.id !== id) st.loadErr = null;
    model.ensureDetail(id).then(({ error }) => { if (error) { st.loadErr = { id, why: error }; if (st.selected === id) renderPane(); } });
  };
  const actBtn = (id, icon, label, title, cls = '') => {
    const b = mk('button', 'iw-act' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.dataset.act = id;
    if (icon) { const i = mk('span', 'iw-act-icon'); i.innerHTML = icon; b.append(i); }
    b.append(mk('span', 'iw-act-label', label)); // a VISIBLE label names the button (the title adds the long form)
    b.title = title;
    return b;
  };
  const ACT = {
    reply: () => actBtn('reply', UI_ICONS.send, t('Reply'), t('Send reply (Enter) · newline (Shift+Enter)'), 'iw-act-primary'),
    done: () => actBtn('done', UI_ICONS.check, t('Mark done'), t('Handled — mark done'), 'iw-act-done'),
    dismiss: () => actBtn('dismiss', UI_ICONS.close, tc('inbox', 'Dismiss'), t('Dismiss (not going to act on this)'), 'iw-act-dismiss'),
    reopen: () => actBtn('reopen', UI_ICONS.refresh, t('Reopen'), t('Reopen')),
    copy: () => actBtn('copy', UI_ICONS.copy, t('Copy'), t('Copy the whole item')),
    producer: () => actBtn('producer', UI_ICONS.refresh, t('Use a reset credit…'), t('Use a reset credit…'), 'iw-act-producer'),
    // "Clear content…" (verify r2: the verb had no visible door, only a right-click) — THE model's verb, the one dialog
    clear: () => actBtn('clear', UI_ICONS.eraser, t('Clear content…'), t('Replace this item’s text — it keeps its place and time'), 'iw-act-clear'),
    'browser-restart': () => actBtn('browser-restart', UI_ICONS.check, t('Restart'), t('Restart the browser that stopped answering — logins stay in the profile, its tabs are re-opened'), 'iw-act-primary'), // lane browser-unresponsive
    'exit-allow': () => actBtn('exit-allow', UI_ICONS.check, t('Allow'), t('Allow'), 'iw-act-primary iw-act-exit'),
    'exit-deny': () => actBtn('exit-deny', UI_ICONS.close, t('Deny'), t('Deny'), 'iw-act-exit'),
    // lane browser-propose: the agent's browser proposal — ONE primary Approve (runs exactly what the item says), a quiet Reject
    'proposal-approve': () => actBtn('proposal-approve', UI_ICONS.check, t('Approve'), t('Runs exactly what this card says'), 'iw-act-primary iw-act-exit'),
    'proposal-reject': () => actBtn('proposal-reject', UI_ICONS.close, t('Reject'), t('Reject'), 'iw-act-exit'),
    // Layer 0 apps: an agent's install proposal — Install… opens THE install dialog (the plan first), Not now declines
    // design 009: a CARD's Install installs (one click — the label is its kind's verb); an item filed before the card opens THE dialog
    'app-install': (it) => (it && it.card ? actBtn('app-install', UI_ICONS.check, cardWords(it.card, t, resolveLang()).go, t('Runs exactly what this card says'), 'iw-act-primary iw-act-exit') : actBtn('app-install', UI_ICONS.check, t('Install…'), t('Shows the plan first — nothing runs until you confirm'), 'iw-act-primary iw-act-exit')),
    'app-retry': () => actBtn('app-retry', UI_ICONS.refresh, t('Try again'), t('Runs exactly what this card says'), 'iw-act-primary'),
    'app-open': () => actBtn('app-open', null, t('Open'), t('Open'), 'iw-act-primary'),
    more: () => actBtn('more', null, '⋯', t('More')),
    'app-reject': () => actBtn('app-reject', UI_ICONS.close, t('Not now'), t('Not now'), 'iw-act-exit'),
  };
  const viewOf = (it, e) => itemView(it, {
    t, words: it.card && it.action && it.action.type === 'app-install' ? cardWords(it.card, t, resolveLang()).title : model.wordsOf(it), detail: model.detailOf(it), replyOpen: st.replyOpen === it.id, name: model.nameFor(it.sessionKey, [it]),
    origin: { origin: originOf(it), label: ORIGIN_LABELS[originOf(it)] || '' }, notice: isNotice(it), resolved: !!(e && e.resolved) || it.status !== 'open',
    reply: model.replyState(it), ago: (ts) => agoText(ts, t), expires: (ts) => expiresText(ts, t), resolvedBy: (by, item) => resolvedByText(by, t, item),
    detailState: !it.detailTruncated ? 'whole' : (st.loadErr && st.loadErr.id === it.id ? 'failed' : 'loading'), loadError: st.loadErr && st.loadErr.id === it.id ? st.loadErr.why : '',
  });
  /** The session's board chip beside its name (the popup's chunk-4 chip: needs input / blocked / review / working). */
  const patchBoardPane = () => {
    const c = st.cur;
    const it = c ? model.byId(c.id) : null;
    if (!it) return;
    const b = String(it.sessionKey || '').includes(':') ? model.boardOf(it.sessionKey) : null;
    const word = b ? b.word : '';
    if (c.board.textContent !== word) c.board.textContent = word;
    c.board.style.display = word ? '' : 'none';
    if (word) { c.board.dataset.state = b.rec.state; c.board.title = b.why || ''; } // an agent's words (or the cleared sentence, worded here) — a title PROPERTY
  };
  let sending = false;
  const patchLivePane = () => {
    const c = st.cur;
    if (!c) return;
    const it = model.byId(c.id);
    if (!it) return;
    model.patchDot(c.ld);
    const v = viewOf(it, st.display.find((e) => e.item.id === c.id));
    const disabled = !v.reply.enabled || sending;
    c.ta.disabled = !v.reply.enabled;
    const whyTxt = v.reply.why ? t(v.reply.why) : '';
    if (c.why.textContent !== whyTxt) c.why.textContent = whyTxt;
    c.why.style.display = whyTxt ? '' : 'none';
    for (const o of c.opts.children) { o.disabled = disabled; o.title = v.reply.enabled ? t('Reply with "{label}"', { label: o.textContent }) : whyTxt; }
    const rb = c.actions.querySelector('[data-act="reply"]');
    if (rb) { rb.disabled = disabled; rb.title = v.reply.enabled ? t('Send reply (Enter) · newline (Shift+Enter)') : whyTxt; }
  };
  const renderPane = () => {
    const id = st.selected;
    const it = id ? model.byId(id) : null;
    if (!it) {
      if (st.cur) { stash(st.cur); st.cur.el.remove(); st.cur = null; }
      paneNone.style.display = '';
      paneNone.textContent = !model.loaded ? t('Loading…') : (st.display.length ? t('Select an item to read it here.') : '');
      paneNone.style.display = paneNone.textContent ? '' : 'none';
      return;
    }
    paneNone.style.display = 'none';
    if (!st.cur || st.cur.id !== id) {
      if (st.cur) { stash(st.cur); st.cur.el.remove(); }
      // design 009: the pane's item changed HERE — its one-click Install (and an Allow / Approve) arms from now; render()'s
      // stamp ran before holdSelection could move the selection (a pane opened onto an item stayed unarmed: every press refused)
      if (st.armId !== id) { st.armId = id; st.armAt = performance.now(); }
      st.cur = buildItem(id);
      pane.append(st.cur.el);
      pane.scrollTop = 0;
    }
    const c = st.cur;
    const e = st.display.find((x) => x.item.id === id);
    const v = viewOf(it, e);
    // head: urgency dot · the session (live dot + name, a button to go there) · the meta words
    c.dot.dataset.urgency = v.notice || v.resolved ? '' : v.urgency;
    c.dot.title = v.meta[0] ? v.meta[0].text : '';
    if (c.ld.dataset.key !== (it.sessionKey || '')) c.ld.dataset.key = it.sessionKey || '';
    c.ld.style.display = String(it.sessionKey || '').includes(':') ? '' : 'none';
    if (c.nm.textContent !== v.name) c.nm.textContent = v.name; // TEXT — a session name is user/peer-controlled
    const metaSig = v.meta.map((m) => m.kind + '\u0001' + m.text).join('\u0000');
    if (c.sig.meta !== metaSig) {
      c.meta.replaceChildren(...v.meta.map((m) => { const s = mk('span', 'iw-meta-' + m.kind, m.text); return s; }));
      c.sig.meta = metaSig;
    }
    c.el.classList.toggle('iw-item-resolved', v.resolved);
    c.el.classList.toggle('iw-item-cleared', model.isCleared(it)); // "Clear content…": the cleared sentence, dimmed
    // the words: the title and the detail at FULL width, rendered (escaped raw HTML + sanitizeHtml), selectable
    if (c.sig.title !== v.title) { mdInto(c.title, v.title, { inline: true }); c.sig.title = v.title; }
    // verify-r4 F4: an exit ask's detail IS the command it asks to run — shown VERBATIM (textContent in a <pre>), never as
    // markdown: `echo "*important*"` rendered as "echo "important"" (the asterisks gone) and a `# clean up` line as a
    // heading, the line breaks folded — the user allowed a command the pane did not show (reproduced)
    const isCmd = !!(it.action && it.action.type === 'exit-run-ask'); // open or answered: a command is never markdown
    // verify r6 F3: a helper's ask carries its WHOLE request in the detail — verbatim too (markdown would eat a `*`,
    // fold its lines and make a `# …` line a heading: the same trap as F4 of r4)
    const verbatim = isCmd || !!(it.action && it.action.type === 'helper-ask');
    // lane browser-propose: a browser proposal's detail is what its Approve runs, line for line — verbatim too, never markdown
    const plain = verbatim || !!(it.action && it.action.type === 'browser-proposal');
    // design 009: an app install's ONE card — its lines, progress and Details fold (escaped; its buttons are the action row)
    const card = it.card && it.action && it.action.type === 'app-install' ? it.card : null;
    const detailSig = card ? 'card\u0000' + (v.resolved ? 'r' : 'o') + JSON.stringify(card) : (plain ? 'cmd\u0000' : 'md\u0000') + v.detail;
    if (c.sig.detail !== detailSig) {
      if (card) { c.detail.innerHTML = appCardHtml(it, t, { lang: resolveLang(), resolved: v.resolved, buttons: false }); c.detail.style.display = ''; }
      else if (plain) { const pre = mk('pre', 'iw-exit-cmd'); pre.textContent = v.detail; c.detail.replaceChildren(pre); }
      else mdInto(c.detail, v.detail);
      if (!card) c.detail.style.display = v.detail ? '' : 'none';
      c.sig.detail = detailSig;
    }
    // a PREVIEWED detail (a resolved item's snapshot): the rest is loaded once, and the pane SAYS it is not whole yet
    if (it.detailTruncated) loadDetail(id);
    const cutTxt = v.cut ? v.cut.text : '';
    if (c.cutLine.textContent !== cutTxt) c.cutLine.textContent = cutTxt;
    c.cutLine.dataset.state = v.cut ? v.cut.state : '';
    c.cutLine.style.display = cutTxt ? '' : 'none';
    const rep = v.replied ? t('You replied: {text}', { text: v.replied }) : '';
    if (c.replied.textContent !== rep) c.replied.textContent = rep; // the WHOLE reply (a row shows 80 chars)
    c.replied.style.display = rep ? '' : 'none';
    // option chips (one click = a reply whose text IS the label, addressed by INDEX)
    const optSig = v.options.map((o) => o.label).join('\u0000');
    if (c.sig.opts !== optSig) {
      c.opts.replaceChildren(...v.options.map((o) => { const b = mk('button', 'iw-opt', o.label); b.type = 'button'; b.dataset.idx = String(o.idx); return b; }));
      c.sig.opts = optSig;
    }
    c.opts.style.display = v.options.length ? '' : 'none';
    // the reply box exists while the item has a reply surface; its node is never replaced
    c.reply.style.display = v.reply.show ? '' : 'none';
    // the action row, keyed by the verdict's action list
    // …and, last, Clear content… on an item that still has words (a cleared one has nothing left to clear)
    const acts = model.isCleared(it) || v.actions.includes('more') ? v.actions : [...v.actions, 'clear']; // a card's Clear content… is in its ⋯
    const actSig = acts.join(',');
    if (c.sig.actions !== actSig) { c.actions.replaceChildren(...acts.map((a) => ACT[a](it))); c.sig.actions = actSig; }
    // the verdict's sentence sits under the box — or, with no box, where the box would be
    // (a helper's ask is answered on its card, a job item in the job panel: itemView's `why`)
    if (!v.reply.show) { if (c.why.parentNode !== c.el) c.el.insertBefore(c.why, c.actions); }
    else if (c.why.parentNode !== c.reply) c.reply.append(c.why);
    patchBoardPane();
    patchLivePane();
  };
  const stash = (c) => { if (c && c.ta) { if (c.ta.value) model.drafts.set(c.id, c.ta.value); else model.drafts.delete(c.id); } };

  // ── THE RENDER (every snapshot, every change of tab / scope / filter / selection) ──
  function render() {
    // verify-r6 V1: the pane's item changed ⇒ its Allow starts its ARM_MS now
    if (st.selected !== st.armId) { st.armId = st.selected; st.armAt = performance.now(); }
    const todos = model.todos;
    if (model.loaded) {
      // STABLE ORDER WHILE OPEN (inc-mtw02kbq-kj96, the popup's rule): append-only until the next open
      st.layout = st.layout ? nextLayout(st.layout, todos) : openLayout(sortGroups(todos.open));
      applyPending();
    }
    const layout = st.layout || { groups: [] };
    const inPlace = new Set(layout.groups.flatMap((g) => g.ids));
    const { action, notices } = splitNotices(entriesFor(layout, todos).map((g) => [g.key, g.entries, g.openCount]));
    const keys = st.scopeKey ? model.keysFor(st.scopeKey) : null;
    const scoped = (entries) => scopeRows(entries, { sessionKey: keys, query: st.query, tab: st.tab, textOf });
    const tailAll = todos.resolved.filter((i) => !inPlace.has(i.id)).map((item) => ({ item, resolved: true, tail: true, notice: isNotice(item), key: item.sessionKey }));
    const tailRowsIn = scoped(tailAll);
    st.tailIds = new Set(tailRowsIn.map((e) => e.item.id));
    // the groups this tab shows, each [key, label, entries]
    let groups;
    if (st.tab === 'notices') {
      const ns = scoped(notices.map((e) => ({ item: e.item, resolved: e.resolved, notice: true, key: e.key })));
      const gs = noticeGroups(ns, 'all', { prev: st.noticeOrder });
      st.noticeOrder = gs.map((g) => g.origin);
      groups = gs.map((g) => ['origin:' + g.origin, t(g.label), g.entries]);
    } else {
      groups = [];
      for (const [key, entries] of action) {
        const es = scoped(entries.map((e) => ({ ...e, key, notice: false })));
        if (es.length) groups.push([key, model.nameFor(key, es.map((e) => e.item)), es]);
      }
    }
    if (st.selected && tailRowsIn.some((e) => e.item.id === st.selected)) st.tailOpen = true;
    const main = groups.flatMap((g) => g[2]);
    st.display = [...main, ...(st.tailOpen ? tailRowsIn : [])];
    if (model.loaded) st.selected = holdSelection(st.display, st.selected);
    // the groups, keyed by data-key (rebuilt only when the tab changes the kind of group)
    if (groupsBox.dataset.tab !== st.tab) { groupsBox.replaceChildren(); groupsBox.dataset.tab = st.tab; }
    const gExisting = new Map([...groupsBox.children].map((c) => [c.dataset.key, c]));
    let gPrev = null;
    for (const [key, label, entries] of groups) {
      let g = gExisting.get(key);
      if (g) gExisting.delete(key); else g = groupEl(key);
      const slot = gPrev ? gPrev.nextElementSibling : groupsBox.firstElementChild;
      if (g !== slot) groupsBox.insertBefore(g, slot);
      gPrev = g;
      const head = g.firstElementChild;
      const nm = head.querySelector(':scope > .iw-group-name');
      if (nm.textContent !== label) nm.textContent = label; // TEXT
      const n = head.querySelector(':scope > .iw-group-n');
      const open = String(entries.filter((e) => !e.resolved).length);
      if (n.textContent !== open) n.textContent = open;
      const dot = head.querySelector(':scope > .ut-live-dot');
      if (dot) model.patchDot(dot);
      reconcileList(g, entries, head);
    }
    for (const g of gExisting.values()) g.remove();
    // the resolved tail, folded behind its head unless opened (or it holds the selection)
    tail.style.display = tailRowsIn.length ? '' : 'none';
    const th = t('Recently resolved') + ` (${tailRowsIn.length})`;
    if (tailHead.textContent !== th) tailHead.textContent = th;
    tailHead.setAttribute('aria-expanded', String(st.tailOpen));
    reconcileList(tailRows, st.tailOpen ? tailRowsIn : [], null);
    // the empty hint
    // the empty hint names WHY the list is empty — under a session scope "nothing needs you" would be a lie (verify round)
    const emptyTxt = !model.loaded ? t('Loading…')
      : main.length ? ''
      : st.query ? t('No matches')
      : st.scopeKey ? (st.tab === 'notices' ? t('No notices for this session.') : t('No open items for this session.'))
      : st.tab === 'notices' ? t('No notices right now.')
      : t('Nothing needs you right now. Agents file items here with vibespace-ask when they need a decision or input.');
    if (listEmpty.textContent !== emptyTxt) listEmpty.textContent = emptyTxt;
    listEmpty.style.display = emptyTxt ? '' : 'none';
    // the tab counts over the open items in scope
    const inScope = keys ? todos.open.filter((i) => keys.includes(i.sessionKey)) : todos.open;
    patchTabs(inScope);
    patchScope();
    const selRow = st.selected ? list.querySelector(`.iw-row[data-id="${CSS.escape(st.selected)}"]`) : null;
    if (selRow) list.setAttribute('aria-activedescendant', selRow.id); else list.removeAttribute('aria-activedescendant');
    if (st.mode === 'single' && root.dataset.view === 'item' && !st.selected) root.dataset.view = 'list';
    renderPane();
  }

  /** Keyboard focus where the user is: the list, or — one pane showing the item — the pane. */
  const focusHome = () => { if (st.mode === 'single' && root.dataset.view === 'item') pane.focus({ preventScroll: true }); else list.focus({ preventScroll: true }); };
  // ── selection + the mail-client rule ──
  const select = (id, { reveal = true, show = false } = {}) => {
    if (st.cur && st.cur.id !== id) stash(st.cur);
    st.selected = id;
    if (show && st.mode === 'single') root.dataset.view = 'item';
    render();
    if (reveal) list.querySelector(`.iw-row[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  /** THIS client resolved `id` (Done / Dismiss / a reply that resolved it): the selection moves on. */
  const advance = (id) => {
    if (st.selected !== id) return;
    const next = nextSelection(st.display, id);
    st.selected = next;
    if (!next && st.mode === 'single') root.dataset.view = 'list';
    render();
    if (next) list.querySelector(`.iw-row[data-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
    focusHome();
  };
  const step = (delta) => {
    const ids = st.display.map((e) => e.item.id);
    if (!ids.length) return;
    const at = ids.indexOf(st.selected);
    const k = at < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, at + delta));
    if (ids[k] !== st.selected) select(ids[k]);
  };

  // ── the verbs (THE model's; the same routes the popup calls) ──
  const sendReply = async (text, { chip = false } = {}) => {
    const c = st.cur;
    if (!c || sending) return;
    const body = String(text || '').trim();
    if (!body) return;
    const it = model.byId(c.id);
    if (!it) return;
    const wasOpen = it.status === 'open';
    sending = true; patchLivePane();
    const ok = await model.postReply(c.id, body);
    sending = false;
    if (ok && !chip && st.cur === c) c.ta.value = '';
    patchLivePane();
    if (ok && wasOpen) advance(c.id);
  };
  const act = async (a, id) => {
    const it = model.byId(id);
    if (!it) return;
    if (a === 'reply') {
      // an empty box: the button puts the cursor where the reply goes instead of doing nothing (verify round)
      const txt = st.cur ? st.cur.ta.value : '';
      if (!String(txt).trim()) { if (st.cur && !st.cur.ta.disabled) st.cur.ta.focus(); return; }
      sendReply(txt); return;
    }
    if (a === 'copy') {
      // a previewed detail is loaded whole first (a failed load is said, and what the pane holds is copied)
      const { error } = await model.ensureDetail(id);
      if (error) showToast(t('Could not load the rest of the text: {why}', { why: error }), { type: 'error' });
      const cur = model.byId(id) || it;
      copyText(itemView(cur, { t, words: model.wordsOf(cur), detail: model.detailOf(cur) }).copy); showToast(t('Copied')); return;
    }
    if (a === 'producer') { model.runAction(it); return; }
    if (a === 'app-install' || a === 'app-retry') {
      // design 009: a card's Install runs on this click — a pane shown a moment ago is not a press on what the user read
      if (it.card && a === 'app-install') { const pv = pressVerdict({ since: st.armId === id ? st.armAt : null, now: performance.now() }); if (!pv.ok) { showToast(t('That Install moved under the pointer just now — read it, then press it again')); return; } }
      model.runAction(it, 'install'); return;
    }
    if (a === 'app-open') { model.runAction(it, 'open'); return; }
    if (a === 'more') {
      // design 009: the card's ⋯ — Reply (opens the box), Mark done, Ignore (both decline it), Copy, Clear content…
      const b = st.cur && st.cur.actions.querySelector('[data-act="more"]');
      const r = b ? b.getBoundingClientRect() : { left: 0, bottom: 0 };
      const rs = model.replyState(it);
      showContextMenu(r.left, r.bottom, [
        ...(rs.show && it.status === 'open' ? [{ label: t('Reply'), action: () => { st.replyOpen = id; renderPane(); if (st.cur && !st.cur.ta.disabled) st.cur.ta.focus(); } }] : []),
        { label: t('Mark done'), action: () => act('done', id) },
        { label: tc('inbox', 'Dismiss'), action: () => act('dismiss', id) },
        { label: t('Copy'), action: () => act('copy', id) },
        ...model.menuFor(id),
      ]);
      return;
    }
    if (a === 'browser-restart') { if (await model.runAction(it)) advance(id); return; } // lane browser-unresponsive: THE model's verb (the server resolves the item)
    if (a === 'app-reject') { if (await model.runAction(it, 'reject')) advance(id); return; }
    if (a === 'clear') { model.clearContent(id); return; } // the store's broadcast repaints the pane (and drops this button)
    if (a === 'proposal-approve' || a === 'proposal-reject') {
      // lane browser-propose: an Approve on a pane shown a moment ago is not a press on what the user read (the exit ask's V1 rule)
      if (a === 'proposal-approve') { const pv = pressVerdict({ since: st.armId === id ? st.armAt : null, now: performance.now() }); if (!pv.ok) { showToast(t('That Approve moved under the pointer just now — read it, then press it again')); return; } }
      if (await model.runAction(it, a === 'proposal-approve' ? 'approve' : 'reject')) advance(id);
      return;
    }
    if (a === 'exit-allow' || a === 'exit-deny') {
      // verify-r6 V1: Allow advances to the next item, whose pane shows Allow in the same place — a press on a pane
      // shown ARM_MS ago or less is not a press on what the user read (a double-click allowed the next ask unseen)
      if (a === 'exit-allow') { const pv = pressVerdict({ since: st.armId === id ? st.armAt : null, now: performance.now() }); if (!pv.ok) { showToast(t('That Allow moved under the pointer just now — read it, then press it again')); return; } }
      if (await model.runAction(it, a === 'exit-allow' ? 'allow' : 'deny')) advance(id);
      return;
    }
    if (a === 'reopen') { await model.setStatus(id, 'open'); return; }
    if (a === 'done' || a === 'dismiss') { if (await model.setStatus(id, a === 'done' ? 'done' : 'dismissed')) advance(id); }
  };

  // ── events (all bound to this window's life: the listener controller's signal) ──
  root.addEventListener('click', (e) => {
    // A NAVIGATION IS A NEW VIEW (verify round): a tab or scope switch re-sorts the list like an open
    // does (a row resolved here leaves its slot for the tail, a newer urgent group rises) — the
    // append-only slots (inc-mtw02kbq-kj96) hold only BETWEEN navigations, where the pointer rests
    const tb = e.target.closest('.iw-tab');
    if (tb) { if (tb.dataset.tab !== st.tab) { st.tab = tb.dataset.tab; st.noticeOrder = null; st.layout = null; render(); } return; }
    const sb = e.target.closest('.iw-scope-btn');
    if (sb) { st.scopeKey = sb.dataset.scope === 'all' ? null : (sb.dataset.key || null); st.layout = null; render(); return; }
    if (e.target.closest('.iw-tail-head')) {
      // closing the tail while one of its rows is selected: the selection moves to the first open row
      // (render re-opens the tail around a selected tail row — the head was a dead control otherwise)
      if (st.tailOpen && st.selected && st.tailIds.has(st.selected)) st.selected = null;
      st.tailOpen = !st.tailOpen; render(); return;
    }
    if (e.target.closest('.iw-back')) { root.dataset.view = 'list'; list.focus({ preventScroll: true }); return; }
    const row = e.target.closest('.iw-row');
    if (row) { select(row.dataset.id, { reveal: false, show: true }); focusHome(); return; }
    const c = st.cur;
    if (!c || !c.el.contains(e.target)) return;
    if (e.target.closest('.iw-sess')) { const it = model.byId(c.id); if (it) model.jump(it.sessionKey, it); return; }
    const opt = e.target.closest('.iw-opt');
    if (opt) {
      const it = model.byId(c.id);
      const label = it && Array.isArray(it.options) ? it.options[Number(opt.dataset.idx)] : null;
      if (label && !opt.disabled) sendReply(label, { chip: true });
      return;
    }
    const b = e.target.closest('.iw-act');
    if (b && !b.disabled) act(b.dataset.act, c.id);
  }, { signal });
  // A ROW'S / THE ITEM'S MENU (right-click; a touch long-press is a contextmenu too): "Clear content…"
  // (2026-09-28) through THE model's verb — the one confirm dialog; the store's broadcast repaints
  // the row and the pane in place. The reply box keeps its own native menu.
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.iw-reply')) return;
    const row = e.target.closest('.iw-row');
    const id = row ? row.dataset.id : (st.cur && st.cur.el.contains(e.target) ? st.cur.id : null);
    const items = id ? model.menuFor(id) : [];
    if (!items.length) return;
    e.preventDefault(); e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, items);
  }, { signal });
  list.addEventListener('keydown', (e) => {
    if (e.target !== list || e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); step(-1); }
    else if (e.key === 'Enter' && st.selected) {
      e.preventDefault();
      if (st.mode === 'single') root.dataset.view = 'item';
      const c = st.cur;
      if (c && c.reply.style.display !== 'none' && !c.ta.disabled) c.ta.focus();
      else pane.focus({ preventScroll: true });
    }
  }, { signal });
  pane.addEventListener('keydown', (e) => {
    const ta = e.target.closest?.('.iw-reply-input');
    if (!ta) return;
    if (e.key === 'Escape' && !e.isComposing) {
      // Esc in the box returns to the list (the text stays); nothing above it closes
      e.preventDefault(); e.stopPropagation();
      if (st.mode === 'single') root.dataset.view = 'list';
      list.focus({ preventScroll: true });
      return;
    }
    // Enter / Ctrl+Enter / Cmd+Enter send; Shift+Enter is a newline; an IME composition's Enter is the IME's
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendReply(ta.value); }
  }, { signal });
  pane.addEventListener('input', (e) => {
    const ta = e.target.closest?.('.iw-reply-input');
    if (ta && st.cur && st.cur.ta === ta) { if (ta.value) model.drafts.set(st.cur.id, ta.value); else model.drafts.delete(st.cur.id); }
  }, { signal });
  filter.addEventListener('input', () => { st.query = filter.value; render(); }, { signal });
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && filter.value) { e.preventDefault(); e.stopPropagation(); filter.value = ''; st.query = ''; render(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list.focus({ preventScroll: true }); if (!st.selected) step(1); }
  }, { signal });

  // ── one pane or two (PURE paneMode over the MEASURED width; the phone is always narrow) ──
  const touch = !!app.isTouch;
  const applyMode = () => {
    const m = paneMode(root.clientWidth, { touch });
    if (!m) return; // unmeasured (minimized / hidden): keep the mode
    if (m.mode !== st.mode) {
      st.mode = m.mode;
      root.classList.toggle('iw-single', m.mode === 'single');
      if (m.mode === 'split') root.dataset.view = 'list';
    }
    const px = m.rowMin ? m.rowMin + 'px' : '';
    if (root.style.getPropertyValue('--iw-row-min') !== px) { if (px) root.style.setProperty('--iw-row-min', px); else root.style.removeProperty('--iw-row-min'); }
  };
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => applyMode());
    ro.observe(root);
    signal?.addEventListener('abort', () => { try { ro.disconnect(); } catch {} });
  }
  winInfo.onResize = applyMode;

  // ── live: the store, the live facts, the board statuses (subscriptions end with the window) ──
  model.on('todos', () => render(), { signal });
  model.on('live', () => {
    for (const dot of groupsBox.querySelectorAll('.ut-live-dot')) model.patchDot(dot);
    patchLivePane();
  }, { signal });
  model.on('status', () => patchBoardPane(), { signal }); // chips only, never a row (the popup's chunk-4 rule)
  signal?.addEventListener('abort', () => { stash(st.cur); });

  /** The door for an OPEN window (a user's ⤢ / menu): select the item, apply the scope, re-sort (a new open). */
  const show = ({ itemId: id = null, sessionKey: key = null } = {}) => {
    if (key) st.scopeKey = key;
    if (id) st.pendingItem = id;
    st.layout = null; // every door is an OPEN: the list re-sorts (the popup's rule; a window kept open all day would never re-sort otherwise)
    render();
    if (id) list.querySelector(`.iw-row[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    if (!syncId) list.focus({ preventScroll: true });
  };
  winInfo._inbox = { show, get state() { return { tab: st.tab, scopeKey: st.scopeKey, query: st.query, selected: st.selected, mode: st.mode, view: root.dataset.view, tailOpen: st.tailOpen }; } };
  applyMode();
  render();
  if (itemId) list.querySelector(`.iw-row[data-id="${CSS.escape(itemId)}"]`)?.scrollIntoView({ block: 'nearest' });
  if (!syncId) setTimeout(() => { if (root.isConnected && !root.contains(document.activeElement)) list.focus({ preventScroll: true }); }, 0);
  return winInfo;
}

registerWindowType({
  type: 'inbox', label: 'For you', singleton: true, icon: ICON,
  action: 'openInbox',
  replay: (app, spec, { syncId } = {}) => app.openInbox({ itemId: spec && spec.itemId, sessionKey: spec && spec.sessionKey, syncId }),
});
/** ⚙ Communication ▸ For you… — the whole inbox as a window (§9 entry point d). */
registerMenuItem({
  menu: 'gear', parent: 'comm', order: 5, icon: ICON, // under Communication ▸ (gear-menu.js head 'comm'; this 5 · Channels 10 · Outbox 20 · Integrations 30)
  label: () => t('For you…'),
  run: (c) => c.app.openInbox(),
});
