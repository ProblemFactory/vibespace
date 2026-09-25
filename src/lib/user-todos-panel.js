// Global user TODO inbox ("For you") — the merged view of every session's
// agent-filed items that need the USER (decisions, missing input, reviews).
// Taskbar button with an open-count badge; the popover groups items by owning
// session (each session's own list is just its group here) and jumps to that
// session to handle them. Items arrive via `vibespace-ask` (agent CLI) and are
// resolved/dismissed here (or by the agent once the user answers in chat).
// Chunk 4 of docs/design-user-inbox-reply.md: a flooded group folds to its 5
// newest rows (PURE foldGroup), "Mark all seen" dismisses a group's open asks
// in ONE request, and a chip beside the name shows the agent's board state.
// B-328d (2026-09-24): the Notices area groups by the PRODUCER that filed each
// notice (origin — src/inbox-origin.js) behind filter chips kept per device,
// and the two tab labels carry counts patched in place (Inbox: the open asks +
// the grey notice count; Notifications: toasts since this device last looked).
import { t } from './i18n.js';
import { openLayout, nextLayout, entriesFor, splitNotices, badgeCounts, liveDotState, replyButtonState, LIVE_DOT_WHY, inboxBadgeFor, miniInboxEntries, foldGroup, FOLD_MAX, noticeGroups, noticeChips, noticeFilterFor, tabCounts, NOTICE_FILTER_KEY, HISTORY_SEEN_KEY } from './user-todos-layout.js'; // PURE: append-only row order while the popup is open (inc-mtw02kbq-kj96); notices split (2.369.118); the running dot + the reply button's verdict (design-user-inbox-reply D1.5/D1.7); the flood fold (chunk 4); notices by origin + the tab counts (B-328d)
import { renderRow, patchRow, applyLive, replyBoxEl, agoText as agoTextOf } from './user-todos-row.js'; // THE row renderer (one spelling of a row; keyed patching keeps a reply box alive)
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { anchorFixedPopup, copyText, createModalShell, createPopover, escHtml, fetchJson, getToastHistory, showToast } from './utils.js';
import { UI_ICONS } from './icons.js';
import { openResetCreditDialog } from './reset-credit-dialog.js'; // THE one reset-credit confirm dialog (design-reset-credits p2): the ask-mode item's button

const URG_RANK = { low: 0, normal: 1, high: 2, urgent: 3 };

export function installUserTodos(app) {
  const btn = document.getElementById('taskbar-user-todos');
  const popup = document.getElementById('user-todos-popup');
  if (!btn || !popup) return;
  // Phone entry point (docs/design-mobile-gaps.md #1): the taskbar — and with
  // it the ONLY binding of this inbox — is display:none ≤768px, so an agent's
  // question reached a phone only as a transient toast. The nav button carries
  // the same segmented badge and opens the same popup (the stylesheet's
  // full-width sheet rule for .usage-popup beats the inline anchor).
  const mBtn = document.getElementById('mobile-nav-todos');
  let todos = { open: [], resolved: [] };
  let knownIds = null; // null until the first load — no toast storm at boot
  let layout = null;   // the popup's row order while OPEN (inc-mtw02kbq-kj96: a ✓ must not slide the next row under the pointer)
  let tab = 'inbox'; // 'inbox' (default) | 'history' — resets to inbox on open
  // THE FLOOD FOLD (design-user-inbox-reply §4 d, chunk 4): group key →
  // {expanded, shown:Set<id>, hidden:Set<id>} of the last paint. Lives only
  // while the popup is open, like the layout (cleared on close and on open).
  const folds = new Map();
  const groupOpen = new Map(); // group key → the open ACTION ids the last paint listed (hidden rows included) — what "Mark all seen" resolves
  // NOTICES BY ORIGIN (B-328d): the filter is per DEVICE (like the language) and
  // survives a close; the group ORDER is append-only while the popup is open
  // (the origins the last paint listed — null on every open, like the layout).
  // THE FILTER IS HELD (r2): read from the device on every open, then fed through
  // noticeFilterFor on every paint — when its origin has no notice the answer
  // (`all`) BECOMES the filter, held AND stored, so an arrival never changes what
  // is shown; only a chip click chooses (see renderNotices).
  const readFilter = () => { try { return localStorage.getItem(NOTICE_FILTER_KEY) || 'all'; } catch { return 'all'; } };
  let noticeFilter = readFilter();
  let noticeOrder = null;
  // THE NOTIFICATIONS TAB'S UNREAD COUNT: toasts newer than this device's last
  // look at the tab. Stamped at install when absent, so an upgrade does not
  // open on the whole 100-entry history as "unread".
  const histSeen = () => { try { const v = Number(localStorage.getItem(HISTORY_SEEN_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; } };
  const markHistorySeen = () => { try { localStorage.setItem(HISTORY_SEEN_KEY, String(Date.now())); } catch { } };
  if (histSeen() == null) markHistorySeen();

  // Match items to sidebar sessions with the sidebar's OWN canonical key
  // derivation (same one the status chips use) — an ad-hoc reimplementation
  // here would drift from it. webui:<serverId> covers items filed before the
  // backend id existed.
  const sessionFor = (key) => (app.sidebar?._allSessions || []).find((s) => {
    if (s.webuiId && `webui:${s.webuiId}` === key) return true;
    try { return app.sidebar._getSessionStateKey(s) === key; }
    catch { return `${s.backend || 'claude'}:${s.sessionId}` === key; }
  });
  const displayName = (s) => {
    try { return app.sidebar?.getCustomName?.(s) || s.name; } catch { return s.name; }
  };
  // THE WORDS OF AN ITEM (a3 i18n, 2026-09-21): a producer that filed its
  // sentences as STRUCTURE (`i18n.text/detail/source` = `{key, params}`) is
  // worded HERE with the device's t(); an item without it is its own words
  // (an agent's ask). The English `text` stays the store's dedupe key.
  const wordsOf = (i) => (i && i.i18n && i.i18n.text ? t(i.i18n.text.key, i.i18n.text.params || {}) : (i && i.text) || '');
  const detailOf = (i) => (i && i.i18n && Array.isArray(i.i18n.detail) && i.i18n.detail.length ? i.i18n.detail.map((l) => t(l.key, l.params || {})).join('\n') : (i && i.detail) || '');
  const nameFor = (key, items) => {
    const s = sessionFor(key);
    const spoken = items.find((i) => i.i18n && i.i18n.source && i.i18n.source.key);
    return (s && displayName(s)) || (spoken && t(spoken.i18n.source.key)) || items.find((i) => i.sessionName)?.sessionName
      || (key.includes(':') ? key.split(':')[1].slice(0, 8) : key);
  };
  const jump = (key, item) => {
    // a job-borne item opens its ANSWER surface directly regardless of which
    // group it sits in (2.357.0: items are attributed to the OWNER session
    // now, so the key is usually a real session — the actionable thing is
    // still the job's form, which focusJobsPanel lands on in the sidebar)
    if (item?.jobId) { popup.classList.add('hidden'); app.openJobInteract?.(item.jobId); return; }
    if (key === 'jobs') { popup.classList.add('hidden'); app.openJobs?.(); return; }
    // Account-level items (login-session expiry, 2026-09-07) belong to the
    // INSTANCE, not a session — the actionable surface is Manage Agents, the
    // same shape the 'jobs' bucket uses. Without this branch the click fell
    // through to "Session not found in the list yet", i.e. a dead end on an
    // item whose whole point is that the user must act.
    if (key === 'accounts') { popup.classList.add('hidden'); app._showAgentsDialog?.(); return; }
    const s = sessionFor(key);
    if (!s) { showToast(t('Session not found in the list yet — try from the sidebar'), { type: 'error' }); return; }
    popup.classList.add('hidden');
    if (s.webuiId) {
      // goToWindow only works when a window is OPEN for it — a live session
      // whose window was closed needs a re-attach instead of a silent no-op.
      const hasWindow = [...app.sessions.values()].some((term) => term.sessionId === s.webuiId);
      if (hasWindow) app.goToWindow(s.webuiId);
      else app.attachSession(s.webuiId, s.webuiName || displayName(s), s.cwd, { mode: s.webuiMode });
    } else if (s.status === 'tmux') app.attachTmuxSession(s.tmuxTarget, displayName(s), s.cwd);
    else if (s.status === 'stopped') app.resumeSession(s.sessionId, s.cwd, displayName(s), { backend: s.backend, hostId: s.hostId || s.host || undefined });
    else showToast(t('This session is running outside VibeSpace'), { type: 'error' });
  };
  const setStatus = async (id, status) => {
    // fetchJson never throws (returns null / the parsed {error} body) — check
    // the success flag or the failure is a silent no-op.
    const r = await fetchJson(`/api/user-todos/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r || !r.success) showToast(t('Could not update the item') + (r?.error ? `: ${r.error}` : ''), { type: 'error' });
  };

  // Dedicated item viewer (user request: the popup rows are hard to read and
  // can't be selected/copied) — markdown-rendered, selectable, with Copy.
  const openViewer = (i) => {
    const { body } = createModalShell({ id: 'ut-viewer', title: nameFor(i.sessionKey, [i]), bodyClass: 'ut-viewer-body', minWidth: 'min(560px, 92vw)', escapeToClose: true });
    const raw = wordsOf(i) + (detailOf(i) ? '\n\n' + detailOf(i) : '');
    // D1.4: the viewer shows the WHOLE reply (a row shows its first 80 chars)
    const replied = i.reply && typeof i.reply.text === 'string' && i.reply.text ? '\n\n---\n\n' + t('You replied: {text}', { text: i.reply.text }) : '';
    const md = document.createElement('div');
    md.className = 'ut-viewer-md';
    md.innerHTML = DOMPurify.sanitize(marked.parse(raw + replied));
    const meta = document.createElement('div');
    meta.className = 'ut-meta';
    meta.textContent = `${i.urgency || 'normal'} · ${agoText(i.createdAt)}${i.resolvedAt ? ` · ${i.status}` : ''}`;
    const actionsRow = document.createElement('div');
    actionsRow.className = 'dialog-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'mounts-btn';
    copyBtn.textContent = t('Copy');
    copyBtn.onclick = () => { copyText(raw + replied); showToast(t('Copied')); };
    actionsRow.append(copyBtn);
    body.append(md, meta, actionsRow);
  };

  // the row words (ago / expires / who resolved it) live with THE row renderer
  const agoText = (ts) => agoTextOf(ts, t);

  // ── LIVE FACTS (design-user-inbox-reply D1.5/D1.7) ────────────────────────
  // The last `active-sessions` payload, keyed the way items are: the payload's
  // own `sessionKey` (`<backend>:<backendSessionId>`) and `webui:<id>` (an item
  // filed before the backend id existed). A chat entry wins over another entry
  // under the same key. It feeds ONLY the dot and the reply controls — patched
  // in place (patchLive), never a row re-render.
  let liveByKey = new Map();
  // webui id → the payload's own sessionKey (chunk 3: a window's view knows
  // only the webui id; its items are keyed by the session key)
  let keyByWebuiId = new Map();
  const ingestLive = (sessions) => {
    const m = new Map();
    const kw = new Map();
    for (const s of sessions || []) {
      if (!s || !s.id) continue;
      if (s.sessionKey) kw.set(s.id, s.sessionKey);
      const fact = { live: true, mode: s.mode || 'terminal', remoteState: s.remoteState || null, turn: s.turn || null };
      for (const k of [s.sessionKey, `webui:${s.id}`]) {
        if (!k) continue;
        const prev = m.get(k);
        if (!prev || (prev.mode !== 'chat' && fact.mode === 'chat')) m.set(k, fact);
      }
    }
    liveByKey = m;
    keyByWebuiId = kw;
  };
  try { ingestLive(app.sidebar?._webuiSessions); } catch { }
  const factFor = (key) => liveByKey.get(key) || null;
  const byId = (id) => todos.open.find((i) => i.id === id) || todos.resolved.find((i) => i.id === id) || null;
  // THE row renderer's context (src/lib/user-todos-row.js) — the panel's words,
  // names and the live verdict; chunk 3's mini inbox passes the same with mini:true
  const rowCtx = { t, nameFor, wordsOf, detailOf, replyState: (i) => replyButtonState(i, factFor(i.sessionKey)) };
  const drafts = new Map(); // item id → the text of a FOLDED reply box (Esc folds, the reply button unfolds it back)

  /** The badge's tiers and its WORDS — ONE spelling shared by the taskbar /
   *  nav button and the Inbox tab's count (B-328d: "same words as the badge"). */
  const tierCounts = (action) => {
    const cu = action.filter((i) => i.urgency === 'urgent').length;
    const ch = action.filter((i) => i.urgency === 'high').length;
    return { cu, ch, cn: action.length - cu - ch };
  };
  const actionWords = (action) => {
    const { cu, ch, cn } = tierCounts(action);
    return action.length
      ? [cu ? t('{n} urgent', { n: cu }) : '', ch ? t('{n} high', { n: ch }) : '', cn ? t('{n} normal', { n: cn }) : '']
          .filter(Boolean).join(' · ') + ' — ' + t('waiting on you')
      : t('Nothing waiting on you');
  };
  const renderBtn = () => {
    // NOTICES (2.369.118, owner: spend notices are DISTRACTING beside real asks):
    // only ACTION items colour the badge; notices are a grey count of their own.
    const { action, notices } = badgeCounts(todos.open);
    const n = action.length;
    const worst = action.reduce((w, i) => Math.max(w, URG_RANK[i.urgency || 'normal'] || 1), 0);
    btn.classList.toggle('ut-has-items', n > 0);
    btn.classList.toggle('ut-has-notices', notices > 0);
    btn.dataset.urgency = n ? (Object.keys(URG_RANK).find((k) => URG_RANK[k] === worst) || 'normal') : '';
    // SEGMENTED badge (owner request): one pill per urgency tier so the
    // high-priority count is readable at a glance — urgent (red) · high
    // (yellow) · rest (accent). Zero tiers don't render; one tier looks
    // exactly like the old single badge.
    const { cu, ch, cn } = tierCounts(action);
    const segs = [cu ? `<span class="ut-count ut-seg-urgent">${cu}</span>` : '',
                  ch ? `<span class="ut-count ut-seg-high">${ch}</span>` : '',
                  cn ? `<span class="ut-count ut-seg-norm">${cn}</span>` : '',
                  notices ? `<span class="ut-count ut-seg-notice" title="${t('{n} notices (for your information)', { n: notices })}">${notices}</span>` : ''].join('');
    btn.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5h3l1 1.8h4l1-1.8h3"/><path d="M3.5 3.5h9l1.5 6v3.5a1 1 0 01-1 1H3a1 1 0 01-1-1V9.5z"/></svg>${segs}`;
    btn.title = actionWords(action) + (notices ? ' · ' + t('{n} notices (for your information)', { n: notices }) : '');
    if (mBtn) {
      // same badge, same classes (the CSS colours by data-urgency / ut-has-items)
      mBtn.innerHTML = UI_ICONS.inbox + segs;
      mBtn.title = btn.title;
      mBtn.classList.toggle('ut-has-items', n > 0);
      mBtn.classList.toggle('ut-has-notices', notices > 0);
      mBtn.dataset.urgency = btn.dataset.urgency;
    }
  };

  // ── THE POPUP: KEYED ROWS, RECONCILED IN PLACE (design-user-inbox-reply D1.9) ──
  // The inbox page is a skeleton built ONCE per open (tabs, title, groups,
  // notices, the recently-resolved tail); every broadcast then RECONCILES it:
  // a row whose `data-id` is still listed is patched (THE row renderer's
  // patchRow — a reply box on it keeps its focus and its text), a new row is
  // appended at its group's end, a row no longer listed is removed. The order
  // is the append-only layout (PURE user-todos-layout.js, inc-mtw02kbq-kj96),
  // so nothing moves under the pointer. Only the Notifications page and the
  // empty hint are still drawn whole (neither can hold an editor).
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // THE TABS (B-328d): built ONCE per open and PATCHED in place — the active
  // mark and the keyed count spans (`.ut-tab-n[data-n]`) follow every broadcast
  // and every toast; a page switch replaces the page below them, never them.
  const TAB_SEG = { urgent: 'ut-seg-urgent', high: 'ut-seg-high', normal: 'ut-seg-norm', low: 'ut-seg-norm' };
  const setCount = (span, n, seg, title) => {
    const disp = n > 0 ? '' : 'none';
    if (span.style.display !== disp) span.style.display = disp;
    const txt = n > 0 ? String(n) : '';
    if (span.textContent !== txt) span.textContent = txt;
    const cls = 'ut-count ut-tab-n ' + seg;
    if (span.className !== cls) span.className = cls;
    if (span.title !== title) span.title = title;
  };
  const patchTabs = () => {
    const d = popup.querySelector(':scope > .ut-tabs');
    if (!d) return;
    const c = tabCounts(todos.open, getToastHistory(), histSeen());
    const { action } = badgeCounts(todos.open);
    for (const b of d.querySelectorAll(':scope > .ut-tab')) {
      const on = b.dataset.tab === tab;
      if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      const q = (k) => b.querySelector(`:scope > .ut-tab-n[data-n="${k}"]`);
      let label;
      if (b.dataset.tab === 'inbox') {
        const words = actionWords(action); // the taskbar badge's own sentence
        const nWords = t('{n} notices (for your information)', { n: c.inbox.notice });
        setCount(q('action'), c.inbox.action, TAB_SEG[c.inbox.urgency] || 'ut-seg-norm', c.inbox.action ? words : '');
        setCount(q('notice'), c.inbox.notice, 'ut-seg-notice', c.inbox.notice ? nWords : '');
        label = t('Inbox') + (c.inbox.action ? ', ' + words : '') + (c.inbox.notice ? ', ' + nWords : '');
      } else {
        const uWords = t('{n} unread', { n: c.history.unread });
        setCount(q('unread'), c.history.unread, 'ut-seg-norm', c.history.unread ? uWords : '');
        label = t('Notifications') + (c.history.unread ? ', ' + uWords : '');
      }
      if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
    }
  };
  const ensureTabs = () => {
    // Two pages (user request): the real inbox (default) and the recent
    // notification-popup history — messages only, newest first.
    let d = popup.querySelector(':scope > .ut-tabs');
    if (!d) {
      d = mk('div', 'ut-tabs');
      for (const [id, label, counts] of [['inbox', t('Inbox'), ['action', 'notice']], ['history', t('Notifications'), ['unread']]]) {
        const b = mk('button', 'ut-tab');
        b.type = 'button';
        b.dataset.tab = id;
        b.append(mk('span', 'ut-tab-label', label));
        for (const k of counts) { const n = mk('span', 'ut-count ut-tab-n'); n.dataset.n = k; n.style.display = 'none'; b.append(n); }
        d.append(b);
      }
      popup.prepend(d);
    }
    patchTabs();
    return d;
  };
  /** Keep a page's typed reply text as drafts before it leaves the DOM (a page
   *  switch — the box's own text would otherwise go with it). */
  const stashDrafts = (el) => {
    for (const box of el.querySelectorAll ? el.querySelectorAll('.ut-reply') : []) {
      const row = box.closest('.ut-item');
      const ta = box.querySelector('textarea');
      if (row && ta && ta.value) drafts.set(row.dataset.id, ta.value);
    }
  };
  /** The popup = the tabs + ONE page (the inbox or the history). */
  const showPage = (page) => {
    const tabs = ensureTabs();
    for (const c of [...popup.children]) if (c !== tabs && c !== page) { stashDrafts(c); c.remove(); }
    if (page.parentNode !== popup) popup.append(page);
  };
  const renderHistory = () => {
    markHistorySeen(); // the page is being LOOKED AT — its unread count clears
    const h = getToastHistory();
    const list = popup.querySelector(':scope > .ut-hist') || mk('div', 'ut-hist');
    list.innerHTML = h.length
      ? h.map((e) => `<div class="ut-hist-item${e.type === 'error' ? ' ut-hist-err' : ''}">
          <div class="ut-hist-msg">${escHtml(e.m)}</div>
          <div class="ut-meta">${escHtml(agoText(e.ts))}</div>
        </div>`).join('')
      : `<div class="empty-hint">${escHtml(t('No notifications yet.'))}</div>`;
    showPage(list);
  };
  const ensureInbox = () => {
    let root = popup.querySelector(':scope > .ut-inbox');
    if (root) { ensureTabs(); return root; }
    root = mk('div', 'ut-inbox');
    const title = mk('div', 'usage-section-title ut-title', t('For you'));
    title.append(mk('span', 'ut-head-sub'));
    const notices = mk('div', 'ut-notices');
    const nh = mk('div', 'ut-notice-head', t('Notices'));
    nh.append(mk('span', 'ut-head-sub'));
    // B-328d: the filter strip, then one group per ORIGIN (the producer that filed it)
    const chips = mk('div', 'ut-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', t('Notices by source'));
    notices.append(nh, chips, mk('div', 'ut-notice-groups'));
    const recent = mk('div', 'ut-recent');
    recent.append(mk('div', 'ut-resolved-head', t('Recently resolved')), mk('div', 'ut-recent-rows'));
    root.append(title, mk('div', 'ut-groups'), mk('div', 'empty-hint ut-empty', t('Nothing needs you right now. Agents file items here with vibespace-ask when they need a decision or input.')), notices, recent);
    showPage(root);
    return root;
  };
  /** Bring `container`'s rows (after `head`, when given) to `entries`, keyed by
   *  data-id. A node moves only when it is out of place — never the common case
   *  while the layout is append-only (moving a focused textarea would blur it). */
  const reconcileRows = (container, entries, head = null, ctx = rowCtx) => {
    const existing = new Map();
    for (const c of container.children) if (c.classList.contains('ut-item')) existing.set(c.dataset.id, c);
    let prev = head;
    for (const e of entries) {
      let row = existing.get(e.item.id);
      if (row) { patchRow(row, e, ctx); existing.delete(e.item.id); }
      else row = renderRow(e, ctx);
      const slot = prev ? prev.nextElementSibling : container.firstElementChild;
      if (row !== slot) container.insertBefore(row, slot);
      prev = row;
    }
    for (const r of existing.values()) r.remove();
  };
  const liveDotTitle = (state) => t(LIVE_DOT_WHY[state] || LIVE_DOT_WHY.off);
  const patchDot = (dot) => {
    const st = liveDotState(factFor(dot.dataset.key));
    if (dot.dataset.state !== st) dot.dataset.state = st;
    const title = liveDotTitle(st);
    if (dot.title !== title) { dot.title = title; dot.setAttribute('aria-label', title); }
  };
  // A group = its BAR (the head — a button that jumps — and, beside it, the
  // "Mark all seen" button: a button never nests in a button), its rows, and
  // the fold's expander last.
  const seenAllEl = () => {
    const b = mk('button', 'ut-seen-all', t('Mark all seen'));
    b.type = 'button';
    b.title = t('Dismiss every open ask of this agent (↺ reopens)');
    return b;
  };
  const groupEl = (key) => {
    const g = mk('div', 'ut-group' + (key === 'jobs' ? ' ut-group-jobs' : ''));
    g.dataset.key = key;
    const bar = mk('div', 'ut-group-bar');
    if (key === 'jobs') {
      const head = mk('div', 'ut-group-head ut-group-head-jobs');
      head.dataset.key = 'jobs'; // a click opens the Background Work panel (it used to fall into "Session not found")
      head.innerHTML = '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4.5" width="12" height="8" rx="1.5"/><path d="M5.5 4.5v-1a1 1 0 011-1h3a1 1 0 011 1v1"/></svg>';
      head.append(mk('span', 'ut-group-name', t('Background Work')), mk('span', 'ut-group-n'));
      bar.append(head, seenAllEl());
      g.append(bar);
      return g;
    }
    const head = mk('button', 'ut-group-head');
    head.dataset.key = key;
    head.title = t('Go to this session');
    // THE RUNNING DOT (D1.7): only a real session key has one (not 'accounts')
    if (key.includes(':')) { const dot = mk('span', 'ut-live-dot'); dot.dataset.key = key; dot.setAttribute('role', 'img'); head.append(dot); }
    head.append(mk('span', 'ut-group-name'), mk('span', 'ut-group-n'), mk('span', 'ut-group-go', '→'));
    bar.append(head, seenAllEl());
    g.append(bar);
    return g;
  };
  // THE BOARD CHIP (design-user-inbox-reply §4 h, chunk 4): the session's own
  // board state (vibespace-status) beside its name — the sidebar-tasks mixin
  // already holds `_sessionStatuses` and its broadcast; the panel only reads it.
  // An item keyed `<backend>:<id>` may have its status still under `webui:<id>`.
  const boardWord = (state) => (state === 'needs-input' ? t('needs input') : state === 'blocked' ? t('blocked') : state === 'review' ? t('review') : state === 'working' ? t('working') : '');
  const statusFor = (key) => {
    const st = app.sidebar?._sessionStatuses || {};
    if (st[key]) return st[key];
    for (const [wid, k] of keyByWebuiId) if (k === key && st[`webui:${wid}`]) return st[`webui:${wid}`];
    return null;
  };
  const patchBoard = (head) => {
    const key = head.dataset.key;
    const rec = key && key.includes(':') ? statusFor(key) : null;
    const word = rec ? boardWord(rec.state) : '';
    let chip = head.querySelector(':scope > .ut-board');
    if (!word) { if (chip) chip.remove(); return; }
    if (!chip) { chip = mk('span', 'ut-board'); head.insertBefore(chip, head.querySelector(':scope > .ut-group-n')); }
    if (chip.dataset.state !== rec.state) chip.dataset.state = rec.state;
    if (chip.textContent !== word) chip.textContent = word;
    const why = typeof rec.reason === 'string' ? rec.reason : ''; // an agent's words — a title PROPERTY, never markup
    if (chip.title !== why) chip.title = why;
  };
  const patchBoards = () => {
    if (popup.classList.contains('hidden') || tab !== 'inbox') return;
    popup.querySelectorAll('.ut-group-bar > button.ut-group-head[data-key]').forEach(patchBoard);
  };
  // ── NOTICES BY ORIGIN (B-328d) ── the strip and the groups, keyed in place
  /** The filter strip, keyed by `data-origin`: `all` first, then one chip per
   *  origin present (PURE noticeChips), the active one `.on` + aria-pressed.
   *  One origin only ⇒ the strip hides (a filter over one group filters nothing). */
  const patchChips = (strip, chips, active) => {
    const disp = chips.length > 2 ? '' : 'none';
    if (strip.style.display !== disp) strip.style.display = disp;
    const existing = new Map([...strip.children].map((c) => [c.dataset.origin, c]));
    let prev = null;
    for (const c of chips) {
      let el = existing.get(c.origin);
      if (el) existing.delete(c.origin);
      else { el = mk('button', 'ut-chip'); el.type = 'button'; el.dataset.origin = c.origin; el.append(mk('span', 'ut-chip-label'), mk('span', 'ut-chip-n')); }
      const slot = prev ? prev.nextElementSibling : strip.firstElementChild;
      if (el !== slot) strip.insertBefore(el, slot);
      prev = el;
      const word = t(c.label); // a PURE table's English key — never item text
      const lab = el.querySelector(':scope > .ut-chip-label');
      if (lab.textContent !== word) lab.textContent = word;
      const n = el.querySelector(':scope > .ut-chip-n');
      if (n.textContent !== String(c.count)) n.textContent = String(c.count);
      const on = c.origin === active;
      if (el.classList.contains('on') !== on) el.classList.toggle('on', on);
      if (el.getAttribute('aria-pressed') !== String(on)) el.setAttribute('aria-pressed', String(on));
      const title = c.origin === 'all' ? t('Show all notices') : t('Show only {source} notices', { source: word });
      if (el.title !== title) el.title = title;
    }
    for (const el of existing.values()) el.remove();
  };
  const noticeGroupEl = (origin) => {
    const g = mk('div', 'ut-notice-group');
    g.dataset.origin = origin;
    const head = mk('div', 'ut-notice-group-head');
    head.append(mk('span', 'ut-group-name'), mk('span', 'ut-group-n'));
    g.append(head);
    return g;
  };
  /** The groups, keyed by `data-origin`, each head + its rows through THE row
   *  reconciler. A filtered-out group is HIDDEN, never removed — a reply box
   *  typed into on one of its rows keeps its node and its text. */
  const renderNotices = (nBox, entries) => {
    // THE FILTER IN FORCE IS ALWAYS A DRAWN CHIP (r2, verifier: a stored choice
    // whose group was absent at open showed All — then a broadcast carrying one
    // notice of that origin silently re-applied it and every other group
    // vanished under an active All chip with no click). Once the store has
    // loaded (an open before the first load has no notices to judge by), the
    // held filter goes through noticeFilterFor and its answer becomes the
    // filter — held for this open and stored for the device, so the strip and
    // the store agree and an arrival never changes the filter in force.
    if (knownIds !== null) { const eff = noticeFilterFor(noticeFilter, entries); if (eff !== noticeFilter) setNoticeFilter(eff); }
    const groups = noticeGroups(entries, noticeFilter, { prev: noticeOrder });
    noticeOrder = groups.map((g) => g.origin);
    patchChips(nBox.querySelector(':scope > .ut-chips'), noticeChips(entries, { prev: noticeOrder }), noticeFilter);
    const box = nBox.querySelector(':scope > .ut-notice-groups');
    const existing = new Map([...box.children].map((c) => [c.dataset.origin, c]));
    let prev = null;
    for (const g of groups) {
      let el = existing.get(g.origin);
      if (el) existing.delete(g.origin); else el = noticeGroupEl(g.origin);
      const slot = prev ? prev.nextElementSibling : box.firstElementChild;
      if (el !== slot) box.insertBefore(el, slot);
      prev = el;
      const head = el.firstElementChild;
      const nm = head.querySelector(':scope > .ut-group-name');
      const word = t(g.label);
      if (nm.textContent !== word) nm.textContent = word;
      const n = head.querySelector(':scope > .ut-group-n');
      if (n.textContent !== String(g.open)) n.textContent = String(g.open);
      const disp = g.shown ? '' : 'none';
      if (el.style.display !== disp) el.style.display = disp;
      reconcileRows(el, g.entries, head);
    }
    for (const el of existing.values()) el.remove();
  };
  const setNoticeFilter = (origin) => {
    noticeFilter = origin || 'all';
    try { localStorage.setItem(NOTICE_FILTER_KEY, noticeFilter); } catch { }
  };
  const renderPanel = () => {
    if (popup.classList.contains('hidden')) { folds.clear(); noticeOrder = null; }
    if (popup.classList.contains('hidden')) { layout = null; return; }
    if (tab === 'history') { renderHistory(); return; }
    const root = ensureInbox();
    const groups = new Map();
    for (const i of todos.open) (groups.get(i.sessionKey) || groups.set(i.sessionKey, []).get(i.sessionKey)).push(i);
    const gs = [...groups.entries()].sort((a, b) => {
      // Background Work is its OWN section, always after session groups
      // (owner report: it read as a weird phantom session mixed in)
      if ((a[0] === 'jobs') !== (b[0] === 'jobs')) return a[0] === 'jobs' ? 1 : -1;
      const w = (items) => Math.max(...items.map((i) => URG_RANK[i.urgency || 'normal'] || 1));
      return (w(b[1]) - w(a[1])) || (Math.max(...b[1].map(i => i.createdAt)) - Math.max(...a[1].map(i => i.createdAt)));
    });
    // STABLE ORDER WHILE OPEN (inc-mtw02kbq-kj96): while the popup is visible
    // the layout is append-only — a resolved row stays in its slot, dimmed
    // with ↺, until the popup closes (the next open rebuilds it sorted).
    layout = layout ? nextLayout(layout, todos) : openLayout(gs);
    const inPlace = new Set(layout.groups.flatMap((g) => g.ids));
    const allRows = entriesFor(layout, todos).map((g) => [g.key, g.entries, g.openCount]);
    // NOTICES (2.369.118): for-your-information rows leave their group for a
    // section of their own under the asks — same append-only slots while open.
    const { action: rows, notices } = splitNotices(allRows);
    const openActions = badgeCounts(todos.open).action.length;
    root.querySelector(':scope > .ut-title > .ut-head-sub').textContent = openActions ? t('{n} open', { n: openActions }) : t('all clear');
    // groups, keyed by data-key
    const gBox = root.querySelector(':scope > .ut-groups');
    const gExisting = new Map([...gBox.children].map((c) => [c.dataset.key, c]));
    let gPrev = null;
    for (const [key, entries, openCount] of rows) {
      let g = gExisting.get(key);
      if (g) gExisting.delete(key); else g = groupEl(key);
      const slot = gPrev ? gPrev.nextElementSibling : gBox.firstElementChild;
      if (g !== slot) gBox.insertBefore(g, slot);
      gPrev = g;
      const bar = g.firstElementChild;
      const head = bar.querySelector(':scope > .ut-group-head');
      const n = head.querySelector(':scope > .ut-group-n');
      if (n.textContent !== String(openCount)) n.textContent = String(openCount);
      if (key !== 'jobs') {
        const nm = head.querySelector(':scope > .ut-group-name');
        const name = nameFor(key, entries.map((e) => e.item));
        if (nm.textContent !== name) nm.textContent = name;
        const dot = head.querySelector(':scope > .ut-live-dot');
        if (dot) patchDot(dot);
        patchBoard(head);
      }
      // "Mark all seen" (chunk 4): shown while the group holds ≥ 2 open asks
      const openIds = entries.filter((e) => !e.resolved).map((e) => e.item.id);
      groupOpen.set(key, openIds);
      const sa = bar.querySelector(':scope > .ut-seen-all');
      const saShow = openIds.length >= 2 ? '' : 'none';
      if (sa.style.display !== saShow) sa.style.display = saShow;
      // THE FLOOD FOLD: > FOLD_MAX open rows ⇒ the newest show, the rest wait
      // behind "{n} more…"; the last paint's shown/hidden sets keep every slot
      const f = folds.get(key) || { expanded: false, shown: null, hidden: null };
      const fold = foldGroup(entries, { max: FOLD_MAX, expanded: f.expanded, prev: f.shown ? f : null });
      folds.set(key, { expanded: f.expanded, shown: new Set(fold.visible.map((e) => e.item.id)), hidden: new Set(fold.hidden.map((e) => e.item.id)) });
      reconcileRows(g, fold.visible, bar);
      let fe = g.querySelector(':scope > .ut-fold');
      if (fold.hidden.length) {
        if (!fe) { fe = mk('button', 'ut-fold'); fe.type = 'button'; }
        const words = t('{n} more…', { n: fold.hidden.length });
        if (fe.textContent !== words) fe.textContent = words;
        if (g.lastElementChild !== fe) g.append(fe);
      } else if (fe) fe.remove();
    }
    for (const g of gExisting.values()) g.remove();
    root.querySelector(':scope > .ut-empty').style.display = rows.length ? 'none' : '';
    // notices — grouped by ORIGIN behind the filter strip (B-328d)
    const nBox = root.querySelector(':scope > .ut-notices');
    nBox.style.display = notices.length ? '' : 'none';
    nBox.querySelector(':scope > .ut-notice-head > .ut-head-sub').textContent = t('{n} for your information', { n: notices.filter((e) => !e.resolved).length });
    renderNotices(nBox, notices.map((e) => ({ item: e.item, resolved: e.resolved, notice: true })));
    // the recently-resolved tail (a row still holding its slot above is not listed twice)
    const recent = todos.resolved.filter((i) => !inPlace.has(i.id)).slice(0, 6);
    const rBox = root.querySelector(':scope > .ut-recent');
    rBox.style.display = recent.length ? '' : 'none';
    reconcileRows(rBox.querySelector(':scope > .ut-recent-rows'), recent.map((item) => ({ item, resolved: true, tail: true })));
  };
  /** The live half ONLY (an `active-sessions` broadcast): every group dot and
   *  every row's reply controls follow the new facts; no row is rebuilt. */
  const patchLive = () => {
    const roots = [];
    if (!popup.classList.contains('hidden') && tab === 'inbox') roots.push(popup);
    if (mini && mini.pop.isConnected) roots.push(mini.pop); // the title-bar mini inbox follows the same facts
    for (const root of roots) {
      root.querySelectorAll('.ut-live-dot').forEach(patchDot);
      root.querySelectorAll('.ut-item').forEach((row) => { const i = byId(row.dataset.id); if (i) applyLive(row, i, rowCtx); });
    }
  };

  // ── THE REPLY (design-user-inbox-reply D1): a box under the row, or a chip ──
  const rowOf = (el) => el && el.closest && el.closest('.ut-item');
  const growBox = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
  const openBox = (row) => {
    const i = byId(row.dataset.id);
    if (!i) return;
    const body = row.querySelector(':scope > .ut-body');
    let box = body.querySelector(':scope > .ut-reply');
    if (!box) {
      box = replyBoxEl(t);
      body.append(box);
      const ta = box.querySelector('textarea');
      ta.value = drafts.get(i.id) || '';
      applyLive(row, i, rowCtx);
      growBox(ta);
    }
    box.querySelector('textarea').focus();
  };
  const foldBox = (box) => {
    const row = rowOf(box);
    const ta = box.querySelector('textarea');
    if (row && ta && ta.value) drafts.set(row.dataset.id, ta.value); else if (row) drafts.delete(row.dataset.id);
    box.remove();
  };
  const sendReply = async (row, text, { chip = false } = {}) => {
    const id = row.dataset.id;
    const body = String(text || '').trim();
    if (!body || row.dataset.sending === '1') return;
    row.dataset.sending = '1';
    const item0 = byId(id);
    if (item0) applyLive(row, item0, rowCtx);
    // fetchJson never throws — a null (network) or an {error, code} body is a
    // FAILURE the user must see (no silent failures); the box keeps its text
    const r = await fetchJson(`/api/user-todos/${encodeURIComponent(id)}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: body }) });
    delete row.dataset.sending;
    if (r && r.ok) {
      showToast(t('Reply sent'));
      drafts.delete(id);
      if (!chip) { const box = row.querySelector(':scope > .ut-body > .ut-reply'); if (box) box.remove(); }
    } else {
      showToast(t('Could not reply: {why}', { why: r && r.error ? t(r.error) : t('server unreachable') }), { type: 'error' });
    }
    const item1 = byId(id);
    if (item1 && row.isConnected) applyLive(row, item1, rowCtx);
  };

  // ── THE MINI INBOX (design-user-inbox-reply §3, chunk 3) ──────────────────
  // Every chat/terminal window's title bar carries a badge counting the open
  // ACTION items of the session it shows (window.js setInboxBadge — this module
  // is the only client-side store of items, so it computes the badges after
  // every broadcast and every window change). A click opens a popover of that
  // session's rows: THE SAME row renderer, THE SAME actions, its own
  // append-only layout (a row resolved while it is open keeps its slot),
  // reconciled in place on every broadcast; a createPopover ⇒ [data-popover] ⇒
  // the global Escape closes it before the panel (the panel's capture listener
  // defers to any [data-popover]).
  let mini = null; // {pop, winId, keys, layout, rows, dot, name, empty} while open
  const miniCtx = { ...rowCtx, mini: true };
  /** The item keys a window answers for: the live payload's own sessionKey for
   *  its webui id, the openSpec's key (a view-only window of a stopped
   *  conversation has only that), and `webui:<id>` (an item filed before the CLI
   *  reported its id). null = not a session window (or a sub-agent's view). */
  const keysForWin = (winId) => {
    const win = app.wm?.windows?.get(winId);
    if (!win || (win.type !== 'chat' && win.type !== 'terminal')) return null;
    const spec = win._openSpec || {};
    if (spec.agentKind === 'subagent' || spec.sourceKind === 'subagent') return null;
    const view = app.sessions?.get(winId);
    const vid = view && typeof view.sessionId === 'string' ? view.sessionId : '';
    const wid = vid && !/^(view-|sub-)/.test(vid) ? vid : (spec.serverId || '');
    const keys = [];
    const add = (k) => { if (k && typeof k === 'string' && !keys.includes(k)) keys.push(k); };
    if (wid) add(keyByWebuiId.get(wid));
    add(spec.sessionKey);
    if (!spec.sessionKey && spec.backend && spec.backendSessionId) add(`${spec.backend}:${spec.backendSessionId}`);
    if (wid) add(`webui:${wid}`);
    return keys.length ? keys : null;
  };
  const primaryKey = (keys) => keys.find((k) => k.includes(':') && !k.startsWith('webui:')) || keys[0];
  let badgeQueued = false;
  const syncBadges = () => {
    badgeQueued = false;
    if (!app.wm?.windows || typeof app.wm.setInboxBadge !== 'function') return;
    for (const winId of [...app.wm.windows.keys()]) {
      const keys = keysForWin(winId);
      const b = keys ? inboxBadgeFor(todos.open, keys) : { count: 0, urgency: '' };
      app.wm.setInboxBadge(winId, b.count ? b : null);
    }
  };
  /** Coalesced: a burst of window changes / broadcasts recounts once. */
  const scheduleBadges = () => { if (badgeQueued) return; badgeQueued = true; queueMicrotask(syncBadges); };
  const renderMini = () => {
    if (!mini) return;
    if (!mini.pop.isConnected) { mini = null; return; }
    mini.keys = keysForWin(mini.winId) || mini.keys;
    const { layout: next, entries } = miniInboxEntries(mini.layout, todos, mini.keys);
    mini.layout = next;
    const pk = primaryKey(mini.keys);
    if (mini.dot.dataset.key !== pk) mini.dot.dataset.key = pk;
    patchDot(mini.dot);
    const name = nameFor(pk, entries.map((e) => e.item)); // TEXT — a session name is user/peer-controlled
    if (mini.name.textContent !== name) mini.name.textContent = name;
    reconcileRows(mini.rows, entries, null, miniCtx);
    mini.empty.style.display = entries.length ? 'none' : '';
  };
  const openMiniInbox = (anchor, winId) => {
    const keys = keysForWin(winId);
    if (!keys || !anchor) return null;
    const pop = createPopover(anchor, 'ut-mini-popover');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', t('Inbox for this session'));
    const head = mk('div', 'ut-mini-head');
    const dot = mk('span', 'ut-live-dot');
    dot.setAttribute('role', 'img');
    const name = mk('span', 'ut-mini-name');
    head.append(dot, mk('span', 'ut-mini-title', t('Inbox for this session')), name);
    const rows = mk('div', 'ut-mini-rows');
    const empty = mk('div', 'empty-hint ut-mini-empty', t('all clear'));
    pop.append(head, rows, empty);
    pop.addEventListener('click', (e) => {
      if (e.target.closest('.ut-detail-exp')) return;
      const item = e.target.closest('.ut-item');
      if (item) rowClick(e, item, { mini: true });
    });
    pop.addEventListener('keydown', (e) => {
      // Esc in a reply box folds the box (its text kept as a draft) and the
      // popover stays; any other Esc falls through to the global layer closer
      if (e.key === 'Escape' && !e.isComposing) {
        const box = e.target?.closest?.('.ut-reply');
        if (box && pop.contains(box)) { foldBox(box); e.preventDefault(); e.stopPropagation(); }
        return;
      }
      replyKeys(e);
    });
    pop.addEventListener('input', growOnInput);
    mini = { pop, winId, keys, layout: null, rows, dot, name, empty };
    renderMini();
    return pop;
  };
  app.openMiniInbox = openMiniInbox;
  app._syncInboxBadges = scheduleBadges;

  const togglePopup = (anchor) => {
    popup.classList.toggle('hidden');
    tab = 'inbox'; // default page on every open (user spec)
    folds.clear(); // the fold state is per open, like the layout
    noticeOrder = null; // …and so is the notice groups' order (the FILTER is per device and stays)
    noticeFilter = readFilter(); // …read afresh from the device on every open (another tab may have chosen), then HELD (renderNotices)
    // a fresh open re-sorts (the layout is append-only only WHILE open) and
    // builds a fresh skeleton; a closed popup keeps nothing but the drafts
    if (!popup.classList.contains('hidden')) { layout = null; popup.replaceChildren(); }
    renderPanel();
    // Anchor to the button's CURRENT position — customize mode can move it to
    // any bar, so the old fixed bottom-right CSS pointed nowhere.
    if (!popup.classList.contains('hidden')) anchorFixedPopup(popup, anchor);
  };
  btn.onclick = () => togglePopup(btn);
  if (mBtn) mBtn.onclick = () => togglePopup(mBtn);
  document.addEventListener('mousedown', (e) => {
    // the nav button is exempt like the taskbar one — a mousedown on it would
    // hide the popup and the click would re-open it (a tap that never closes)
    // the title-bar mini inbox (chunk 3) is a layer ABOVE the panel, not outside it
    if (e.target?.closest?.('.ut-mini-popover, .win-inbox-badge')) return;
    if (!popup.contains(e.target) && !btn.contains(e.target) && !(mBtn && mBtn.contains(e.target))) popup.classList.add('hidden');
  });
  // Escape closes the popup / phone sheet (verifier r2). This is a PERSISTENT
  // element, so it cannot carry [data-popover] — the global handler (app.js
  // _setupDialogs) REMOVES those nodes. Layer-by-layer like that handler,
  // and explicitly ordered: this listener runs in the CAPTURE phase (before
  // the global bubble one) and DEFERS whenever a transient layer sits above
  // the sheet — an open [data-popover] or any visible .dialog-overlay (the
  // static #dialog-overlay or a createModalShell modal such as the ⤢ viewer)
  // — so one Escape closes exactly one layer; a terminal keeps its own Esc.
  // (The viewer's own stopPropagation cannot order it: this capture listener
  // on document runs before the overlay's handler.) (Not `defaultPrevented`:
  // a synthesized keydown is rarely cancelable, so that flag is no order.)
  // A REPLY BOX is the innermost layer: Esc inside one folds it (its text is
  // kept as a draft) and the sheet stays open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.isComposing) return;
    if (popup.classList.contains('hidden')) return;
    if (e.target?.closest?.('.xterm')) return;
    if (document.querySelector('[data-popover]')) return;
    // ANY visible .dialog-overlay — the static #dialog-overlay AND every
    // createModalShell overlay (the ⤢ viewer #ut-viewer, the reset-credit
    // dialog…): a capture listener on document runs BEFORE the modal's own
    // keydown, so without this one Escape closed two layers (inbox r1).
    for (const o of document.querySelectorAll('.dialog-overlay')) if (!o.classList.contains('hidden')) return;
    const box = e.target?.closest?.('.ut-reply');
    if (box && popup.contains(box)) { foldBox(box); e.preventDefault(); e.stopPropagation(); return; }
    popup.classList.add('hidden');
    e.preventDefault();
  }, { capture: true });
  function replyKeys(e) {
    const ta = e.target?.closest?.('.ut-reply-input');
    if (!ta) return;
    // Enter sends, Shift+Enter is a newline; an IME composition's Enter is the IME's
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      const row = rowOf(ta);
      const send = row && row.querySelector(':scope > .ut-body > .ut-reply > .ut-reply-send');
      if (row && !(send && send.disabled)) sendReply(row, ta.value);
    }
  }
  const growOnInput = (e) => { if (e.target?.classList?.contains('ut-reply-input')) growBox(e.target); };
  popup.addEventListener('keydown', replyKeys);
  popup.addEventListener('input', growOnInput);
  // "Mark all seen" (chunk 4): ONE POST for the group's open asks (hidden rows
  // included) ⇒ the store's setStatusMany ⇒ ONE broadcast ⇒ every row strikes
  // IN PLACE (the slot law) and the badges recount; a failure is a toast.
  const markAllSeen = async (btnEl) => {
    const key = btnEl.closest('.ut-group')?.dataset.key;
    const ids = (key && groupOpen.get(key)) || [];
    if (!ids.length || btnEl.dataset.busy === '1') return;
    btnEl.dataset.busy = '1'; btnEl.disabled = true;
    const r = await fetchJson('/api/user-todos/resolve-many', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status: 'dismissed' }) });
    delete btnEl.dataset.busy; btnEl.disabled = false;
    if (!r || !r.ok) showToast(t('Could not update {n} items: {why}', { n: ids.length, why: r && r.error ? r.error : t('server unreachable') }), { type: 'error' });
  };
  popup.addEventListener('click', (e) => {
    const tb = e.target.closest('.ut-tab');
    if (tb) { if (tb.dataset.tab !== tab) { tab = tb.dataset.tab; renderPanel(); } return; } // the page below the tabs switches; the tabs are patched, never rebuilt
    // a notice FILTER chip (B-328d): per device; the active origin chip again = all
    const chipEl = e.target.closest('.ut-chip');
    if (chipEl) {
      const o = chipEl.dataset.origin;
      setNoticeFilter(o !== 'all' && chipEl.classList.contains('on') ? 'all' : o);
      renderPanel();
      return;
    }
    const fb = e.target.closest('.ut-fold');
    if (fb) {
      const k = fb.closest('.ut-group')?.dataset.key;
      const f = folds.get(k);
      if (f) f.expanded = !f.expanded; else if (k) folds.set(k, { expanded: true, shown: null, hidden: null });
      renderPanel();
      return;
    }
    const sa = e.target.closest('.ut-seen-all');
    if (sa) { markAllSeen(sa); return; }
    const head = e.target.closest('.ut-group-head');
    if (head) { if (head.dataset.key) jump(head.dataset.key); return; }
    // A click on the detail expander is a toggle, not a jump — without this
    // guard opening the detail would bubble into the row's jump-and-close.
    if (e.target.closest('.ut-detail-exp')) return;
    const item = e.target.closest('.ut-item');
    if (!item) return;
    rowClick(e, item);
  });
  /** Every action ON A ROW — the panel's and the mini inbox's (chunk 3) are the
   *  same rows through the same renderer, so one handler serves both; only the
   *  row-body click differs: the panel jumps to the session, the mini inbox is
   *  already IN that session's window (`mini` ⇒ no jump). */
  function rowClick(e, item, { mini = false } = {}) {
    const id = item.dataset.id;
    // the reply box is a place to type, never a jump
    const sendBtn = e.target.closest('.ut-reply-send');
    if (sendBtn) { if (!sendBtn.disabled) { const ta = item.querySelector(':scope > .ut-body > .ut-reply > textarea'); sendReply(item, ta ? ta.value : ''); } return; }
    if (e.target.closest('.ut-reply')) return;
    const chip = e.target.closest('.ut-opt');
    if (chip) {
      const rec = byId(id);
      const label = rec && Array.isArray(rec.options) ? rec.options[Number(chip.dataset.idx)] : null;
      if (label && !chip.disabled) sendReply(item, label, { chip: true });
      return;
    }
    const rb = e.target.closest('.ut-reply-btn');
    if (rb) {
      if (rb.disabled) return;
      const box = item.querySelector(':scope > .ut-body > .ut-reply');
      if (box && !box.querySelector('textarea').value) foldBox(box); else openBox(item);
      return;
    }
    if (e.target.closest('.ut-view')) {
      const rec = byId(id);
      if (rec) openViewer(rec);
      return;
    }
    if (e.target.closest('.ut-action-reset')) {
      const rec = todos.open.find((i) => i.id === id);
      if (rec && rec.action) openResetCreditDialog(app, { accountKey: rec.action.accountKey, sessionId: rec.action.sessionId || null, todoId: rec.id });
      return;
    }
    if (e.target.closest('.ut-done')) setStatus(id, 'done');
    else if (e.target.closest('.ut-dismiss')) setStatus(id, 'dismissed');
    else if (e.target.closest('.ut-reopen')) setStatus(id, 'open');
    else {
      if (mini) return; // the mini inbox lives in this session's own window — nothing to jump to
      // a real text SELECTION inside the row must not jump-and-close
      if (String(window.getSelection?.() || '')) return;
      const rec = byId(id);
      if (rec) jump(rec.sessionKey, rec);
    }
  }

  const apply = (next) => {
    const prevKnown = knownIds;
    todos = next || { open: [], resolved: [] };
    // Toast genuinely NEW items — click one to jump. Known ids include the
    // resolved tail, so a user reopening an item doesn't get toasted for their
    // own action. The knownIds closure survives reconnects, so a resync after
    // an offline gap toasts exactly the items that arrived meanwhile (the
    // toast stack self-caps at 4).
    if (prevKnown) {
      for (const i of todos.open) {
        if (prevKnown.has(i.id)) continue;
        const el = showToast(`${t('For you')} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i)}`);
        if (el) { el.style.cursor = 'pointer'; el.onclick = () => jump(i.sessionKey, i); }
        btn.classList.remove('ut-blink'); void btn.offsetWidth; btn.classList.add('ut-blink');
      }
    }
    knownIds = new Set([...todos.open, ...todos.resolved].map((i) => i.id));
    renderBtn(); renderPanel(); renderMini(); scheduleBadges();
  };

  let liveSeen = false; // a broadcast beat the initial fetch — don't clobber it with the older snapshot
  app.ws.onGlobal((msg) => { if (msg.type === 'user-todos-updated' && msg.todos) { liveSeen = true; apply(msg.todos); } });
  // THE LIVE FACTS (D1.7): the session list's own broadcast — the running dot and
  // the reply controls are patched in place, rows are never re-rendered for it
  app.ws.onGlobal((msg) => { if (msg.type === 'active-sessions' && Array.isArray(msg.sessions)) { ingestLive(msg.sessions); patchLive(); scheduleBadges(); } });
  // THE BOARD CHIP (chunk 4): the sidebar-tasks mixin stores the statuses from
  // the same broadcast — patched after it (a microtask: handler order is not
  // ours to rely on), chips only, never a row
  app.ws.onGlobal((msg) => { if (msg.type === 'session-status-updated' && msg.statuses) queueMicrotask(patchBoards); });
  // Resync on reconnect — items filed while offline would otherwise stay
  // invisible until the next unrelated change re-broadcasts.
  app.ws.onStateChange?.((connected) => {
    if (connected) fetchJson('/api/user-todos').then((d) => { if (d?.todos) apply(d.todos); });
  });
  fetchJson('/api/user-todos').then((d) => { if (d?.todos && !liveSeen) apply(d.todos); });
  // A toast fired while the history page is open → live-refresh it
  // (and on the inbox page the Notifications tab's unread count ticks up in place)
  window.addEventListener('vs-toast', () => { if (popup.classList.contains('hidden')) return; if (tab === 'history') renderPanel(); else patchTabs(); });
  renderBtn();
}
