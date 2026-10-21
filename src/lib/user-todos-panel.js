// Global user TODO inbox ("For you") — the merged view of every session's
// agent-filed items that need the USER (decisions, missing input, reviews).
// Taskbar button with an open-count badge; the popover groups items by owning
// session (each session's own list is just its group here) and jumps to that
// session to handle them. Items arrive via `vibespace-ask` (agent CLI) and are
// resolved/dismissed here (or by the agent once the user answers in chat).
// Chunk 4 of docs/design-user-inbox-reply.md: "Mark all seen" dismisses many
// asks in ONE request (lane foryou-folds: a band's, where it was a group's; the
// per-group flood fold and the board chip left with the group heads).
// B-328d (2026-09-24): the Notices area groups by the PRODUCER that filed each
// notice (origin — src/inbox-origin.js) behind filter chips kept per device,
// and the two tab labels carry counts patched in place (Inbox: the open asks +
// the grey notice count; Notifications: toasts since this device last looked).
// §9 (2026-09-27): the store, the live facts, the words of an item and every
// verb on one live in src/lib/user-todos-actions.js (the For-you WINDOW is a
// second surface over them); ⤢ on a row, on the popup's tab strip and on the
// mini inbox's head opens THE window (src/lib/inbox-window.js, app.openInbox) —
// the read-only viewer modal is retired.
// lane foryou-folds (design q-044, the owner's decisions 1 2 3 6 of 2026-10-19): THE INBOX PAGE IS THE ATTENTION LIST —
// src/attention-model.js `needsMe` drawn as five bands + 搁置 (flat rows, each naming its conversation), the first 6
// rows on the first screen and everything after them folded BY BAND behind 「还有 N 条 — 展开」 (expanded in place,
// keyed rows patched); 「全部标为已看」 acts on one band (never 紧急); notices are a grey count that opens in one
// click; the badge counts bands 1–4; an arrival toasts only in bands 1–2. The LLM plugin's three sections and the
// per-conversation flood fold are retired (the judge only breaks a band-5 tie).
// lane phone-first-screen (design q-044 decision 5): ON A PHONE THE SAME BANDS ARE THE FIRST SCREEN — a page over the
// window area (#phone-home, `app.phoneHome`): the boot opens on it when its first screen holds a row; a row's tap opens
// the conversation (every window open / focus hides the page — window.js's central yield); the back gesture returns to
// it (mobile-back.js: HOME = the page while the list has rows, else the conversation list); ☰ still opens the list.
import { t, tc } from './i18n.js';
import { rowOf as attentionRow, toastWorthy, PARKED, FOLD_HEAD, settingsPolicy, bandKey, BANDS, CAP_KEY } from '../attention-model.js'; // PURE: THE attention list (lane foryou-folds) — an arrival's band (the toast rule), the 搁置 band, the fold's words; the owner's switches + cap (lane attention-predicate-shared, settingsPolicy — their ONE reader)
import { sortGroups, openLayout, nextLayout, entriesFor, splitNotices, badgeOf, bandLayout, bandEntries, inboxBadgeFor, miniInboxEntries, noticeGroups, noticeChips, noticeFilterFor, tabCounts, NOTICE_FILTER_KEY, HISTORY_SEEN_KEY } from './user-todos-layout.js'; // PURE: the append-only order while the popup is open (inc-mtw02kbq-kj96) — the notices' groups and the bands' slots (lane foryou-folds); notices split (2.369.118); notices by origin + the tab counts (B-328d)
import { inboxModel, tierCounts, actionWords } from './user-todos-actions.js'; // THE client model (§9): the store, the live facts (the running dot + the reply verdict, D1.5/D1.7), the words, every verb — shared with the For-you window
import { trayWhere } from './user-todos-layout.js'; // lane S3: the new-item toast names the corner the tray sits in on this device
import { renderRow, patchRow, applyLive, replyBoxEl, reconcileKeyed, agoText as agoTextOf } from './user-todos-row.js'; // THE row renderer (one spelling of a row; keyed patching keeps a reply box alive)
import { anchorFixedPopup, copyText, createPopover, escHtml, fetchJson, getToastHistory, onOutsidePress, showContextMenu, showToast, stripLegacyRecordToasts } from './utils.js';
import { UI_ICONS } from './icons.js';
import { BACK_DISMISS_EVENT } from './back-guard.js'; // lane mobile-back-guard: the phone's back closes this sheet through hidePopup
import { pressVerdict, armAfterLayout } from './press-arm.js'; // verify-r6 V1: an Allow counts only once it sat still where it was read

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
  const model = inboxModel(app); // THE one store + the verbs (src/lib/user-todos-actions.js) — the For-you window asks for the same one
  let todos = { open: [], resolved: [] };
  let knownIds = null; // null until the first load — no toast storm at boot
  let layout = null;   // the popup's row order while OPEN (inc-mtw02kbq-kj96: a ✓ must not slide the next row under the pointer)
  let tab = 'inbox'; // 'inbox' (default) | 'history' — resets to inbox on open
  // THE BANDS (lane foryou-folds): their slots while the popup is open (PURE bandLayout — the first screen, the folds, a
  // row resolved in place, an arrival appended; null on every open, like the layout) and, per band, the open ids the last
  // paint listed (folded rows included) — what that band's 「全部标为已看」 resolves
  let bands = null;
  const bandOpen = new Map();
  // lane attention-predicate-shared (decision 4): THE OWNER'S POLICY — the band switches + the first screen's size, read per
  // paint through the ONE reader (settingsPolicy); `bandOff` = the switched-off bands the last fresh layout moved rows from
  const attnPolicy = () => settingsPolicy((k) => app.settings?.get?.(k));
  let bandOff = [];
  let noticesOpen = false; // the notices are a grey count until one click opens them (per open, like the folds)
  // THE PHONE'S FIRST SCREEN (lane phone-first-screen): the SAME bands drawn as a PAGE (#phone-home) — while it is on show
  // it holds its own slots, folds, notice order and per-band open ids (the popup's rules: null on every show); hidden, it
  // keeps nothing but the drafts. Phone only (null on a desktop — nothing below runs there).
  const home = app.isMobile ? document.getElementById('phone-home') : null;
  const H = { layout: null, bands: null, open: new Map(), noticesOpen: false, noticeOrder: null };
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
  // an older build kept a For-you item's WORDS in its arrival toast (this device's localStorage) — cut back to the head on every
  // load, in this device's language and in English (lane-redact verify r4; a cleared item's words must not outlive the clear here)
  stripLegacyRecordToasts([t('Added to For you'), 'Added to For you']);

  // The words of an item, its session's name, the jump to where it is answered
  // and the status POST are THE model's (moved verbatim, §9) — the popup hides
  // itself before a jump; the window stays.
  const { wordsOf, detailOf, nameFor } = model;
  // A CLOSED POPUP KEEPS NOTHING BUT THE DRAFTS (lane-redact verify r7): every closer — a jump, the ⤢, an outside press,
  // Escape, the button — goes through here, and the rows LEAVE the DOM with the close (a typed reply is kept as a draft
  // first). A record cleared while the popup is closed — the owner's natural path: the right-click on another surface's
  // row is the outside press that closed it — otherwise stayed in the hidden rows (the item's text, its session's status
  // chip) until the next open rebuilt them; an open popup is patched live, and every open builds a fresh skeleton.
  const hidePopup = () => { popup.classList.add('hidden'); layout = null; dropRows(); };
  popup.addEventListener(BACK_DISMISS_EVENT, (e) => { e.preventDefault(); hidePopup(); }); // the phone's back gesture: drafts stashed, rows dropped — the one closer
  const dropRows = () => { if (!popup.firstChild) return; stashDrafts(popup); popup.replaceChildren(); };
  const jump = (key, item) => model.jump(key, item, { close: () => { hidePopup(); hideHome(); } }); // leaving: the popup AND the phone's page step aside (a jump to a dialog, the jobs panel or a plugin's sheet opens no window — the central yield never runs)
  /** lane foryou-attachments: a press on an ask's chip (THE one artifact door) or a link in its words (resolved against the
   *  asker's cwd on its host) — the tray steps aside first (on the phone it covers the viewer). True = handled. */
  const fyPress = (e, close) => {
    const fy = e.target.closest && e.target.closest('.ut-art, .fy-link');
    if (!fy) return false;
    e.preventDefault(); e.stopPropagation();
    const rowEl = fy.closest('.ut-item');
    const it = rowEl && byId(rowEl.dataset.id);
    if (!it) return true;
    close();
    if (fy.classList.contains('ut-art')) model.openArtifact(it, Number(fy.dataset.ai));
    else model.openLink(it, fy.dataset.fy, fy.dataset.ref);
    return true;
  };
  const setStatus = (id, status) => model.setStatus(id, status);

  // the row words (ago / expires / who resolved it) live with THE row renderer
  const agoText = (ts) => agoTextOf(ts, t);

  // ── LIVE FACTS (design-user-inbox-reply D1.5/D1.7) ── the model's: the last
  // `active-sessions` payload keyed the way items are (factFor), the webui id →
  // sessionKey map (keyForWebui), the reply verdict per item (replyState)
  const byId = (id) => todos.open.find((i) => i.id === id) || todos.resolved.find((i) => i.id === id) || null;
  // THE row renderer's context (src/lib/user-todos-row.js) — the model's words,
  // names and the live verdict; chunk 3's mini inbox passes the same with mini:true
  const rowCtx = model.rowCtx;
  const drafts = model.drafts; // item id → the text of a FOLDED reply box (Esc folds, the reply button unfolds it back) — one draft per item across the popup and the window

  // The badge's tiers and its WORDS (tierCounts / actionWords) — ONE spelling
  // shared by the taskbar / nav button, the Inbox tab's count (B-328d: "same
  // words as the badge") and the For-you window's Actions tab: imported.
  const renderBtn = () => {
    // NOTICES (2.369.118, owner: spend notices are DISTRACTING beside real asks):
    // only ACTION items colour the badge; notices are a grey count of their own.
    // lane foryou-folds: the badge counts the attention list's bands 1–4 (a band-5 ask or a row in 搁置 moves only the list)
    const { action, notices } = badgeOf(todos.open, Date.now(), attnPolicy());
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
    const now = Date.now();
    const c = tabCounts(todos.open, getToastHistory(), histSeen(), now, attnPolicy()); // lane foryou-folds: the Inbox tab = the badge's own number (bands 1–4)
    const { action } = badgeOf(todos.open, now, attnPolicy());
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
      // §9: the WHOLE inbox as a window (long messages read at full width) — the
      // same ⤢ every row carries; a tab-strip sibling, never a `.ut-tab`
      const ow = mk('button', 'ut-act ut-open-win', '⤢');
      ow.type = 'button';
      ow.title = t('Open as a window');
      ow.setAttribute('aria-label', ow.title);
      d.append(ow);
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
  // a record's toast is worded from the LIVE store — its label and its words (a cleared item reads the sentence; one no longer
  // in the snapshot, nothing): the entry itself keeps the head only
  const histWords = (e) => { if (!e || !e.ref || e.ref.kind !== 'todo') return ''; const it = byId(e.ref.id); return it ? `${nameFor(it.sessionKey, [it])}: ${wordsOf(it)}` : ''; };
  const renderHistory = () => {
    markHistorySeen(); // the page is being LOOKED AT — its unread count clears
    const h = getToastHistory();
    const list = popup.querySelector(':scope > .ut-hist') || mk('div', 'ut-hist');
    list.innerHTML = h.length
      ? h.map((e) => `<div class="ut-hist-item${e.type === 'error' ? ' ut-hist-err' : ''}">
          <div class="ut-hist-msg">${escHtml(e.m)}${histWords(e) ? ' · ' + escHtml(histWords(e)) : ''}</div>
          <div class="ut-meta">${escHtml(agoText(e.ts))}</div>
        </div>`).join('')
      : `<div class="empty-hint">${escHtml(t('No notifications yet.'))}</div>`;
    showPage(list);
  };
  /** The notices' box (the popup's and the phone page's). */
  const noticesEl = () => {
    const notices = mk('div', 'ut-notices');
    // lane foryou-folds: the notices' head is ONE button — the grey count, a click opens the strip and the groups in place
    const nh = mk('button', 'ut-notice-head', t('Notices'));
    nh.type = 'button';
    nh.title = t('Show the notices');
    nh.append(mk('span', 'ut-head-sub'));
    // B-328d: the filter strip, then one group per ORIGIN (the producer that filed it)
    const chips = mk('div', 'ut-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', t('Notices by source'));
    notices.append(nh, chips, mk('div', 'ut-notice-groups'));
    return notices;
  };
  const ensureInbox = () => {
    let root = popup.querySelector(':scope > .ut-inbox');
    if (root) { ensureTabs(); return root; }
    root = mk('div', 'ut-inbox');
    const title = mk('div', 'usage-section-title ut-title', t('For you'));
    title.append(mk('span', 'ut-head-sub'));
    const notices = noticesEl();
    const recent = mk('div', 'ut-recent');
    recent.append(mk('div', 'ut-resolved-head', t('Recently resolved')), mk('div', 'ut-recent-rows'));
    root.append(title, mk('div', 'ut-groups ut-bands'), mk('div', 'empty-hint ut-empty', t('Nothing needs you right now. Agents file items here with vibespace-ask when they need a decision or input.')), notices, recent);
    showPage(root);
    return root;
  };
  /** Bring `container`'s rows (after `head`, when given) to `entries`, keyed by
   *  data-id. A node moves only when it is out of place — never the common case
   *  while the layout is append-only (moving a focused textarea would blur it). */
  const reconcileRows = (container, entries, head = null, ctx = rowCtx) => {
    reconcileKeyed(container, entries, {
      head, isRow: (c) => c.classList.contains('ut-item'), create: (e) => renderRow(e, ctx), patch: (row, e) => patchRow(row, e, ctx),
    });
    armExitButtons();
    container.querySelectorAll(':scope > .ut-item .ut-live-dot').forEach((d) => patchDot(d)); // lane foryou-folds: a band row's running dot (a new / re-drawn row starts unpainted)
  };
  // verify-r6 V1: every "Allow … to run a command?" button in the page, re-stamped after each row pass — one that
  // appeared or MOVED (a resolved row above it shrank, an expiry) starts its ARM_MS again (PURE src/lib/press-arm.js)
  const armExitButtons = () => {
    const now = performance.now();
    for (const b of document.querySelectorAll('.ut-action-exit.ut-exit-allow, .ut-action-proposal.ut-proposal-approve, .ut-action-app.ut-app-install')) { // lane browser-propose: an Approve is armed the same way; design 009: so is a card's one-click Install
      const top = b.getBoundingClientRect().top;
      b._armSince = armAfterLayout({ prevTop: b._armTop ?? null, top, prevSince: b._armSince ?? null, now });
      b._armTop = top;
    }
  };
  const patchDot = (dot) => model.patchDot(dot); // THE running dot (D1.7: liveDotState over the model's live fact)
  // A BAND (lane foryou-folds) = its BAR — the band's name, its open count and, on every band but 紧急, 「全部标为已看」
  // (a button never nests in a button) — its SHOWN rows (keyed, patched in place), and its FOLD last: 「还有 N 条 — 展开」
  // opens the band where it stands. A band whose every row is folded (搁置 on every open) carries its fold IN the bar.
  const seenAllEl = () => {
    const b = mk('button', 'ut-seen-all', t('Mark all seen'));
    b.type = 'button';
    b.title = t('Dismiss every open row of this band (↺ reopens)');
    return b;
  };
  const bandEl = (band) => {
    const g = mk('div', 'ut-band' + (band === PARKED ? ' ut-band-parked' : ''));
    g.dataset.band = String(band);
    const bar = mk('div', 'ut-band-bar');
    bar.append(mk('span', 'ut-band-name'), mk('span', 'ut-band-n'));
    if (band !== 1) bar.append(seenAllEl()); // 紧急 has no 「全部标为已看」
    g.append(bar);
    return g;
  };
  /** The bands, keyed by data-band, in the list's order (PURE bandEntries over the held slots). */
  const drawBands = (box, drawn, open = bandOpen) => { // `open` = the surface's band → open ids (the popup's, or the phone page's H.open)
    const existing = new Map([...box.children].map((c) => [c.dataset.band, c]));
    let prev = null;
    for (const b of drawn) {
      let g = existing.get(String(b.band));
      if (g) existing.delete(String(b.band)); else g = bandEl(b.band);
      const slot = prev ? prev.nextElementSibling : box.firstElementChild;
      if (g !== slot) box.insertBefore(g, slot);
      prev = g;
      const bar = g.firstElementChild;
      const nm = bar.querySelector(':scope > .ut-band-name');
      const word = t(b.name); // a PURE table's English key — never item text
      if (nm.textContent !== word) nm.textContent = word;
      const n = bar.querySelector(':scope > .ut-band-n');
      if (n.textContent !== String(b.openCount)) n.textContent = String(b.openCount);
      open.set(String(b.band), b.openIds);
      const sa = bar.querySelector(':scope > .ut-seen-all');
      if (sa) { const show = b.openIds.length >= 2 ? '' : 'none'; if (sa.style.display !== show) sa.style.display = show; }
      // lane attention-predicate-shared (decision 4): A BAND SWITCHED OFF IS SAID, ONCE — on band 5's head, where its rows now sit
      let note = g.querySelector(':scope > .ut-band-off');
      const offWords = b.band === 5 ? bandOff.map((o) => (o.to ? t('{band} is switched off — {n} of its rows sit with Other questions', { band: t(o.name), n: o.n }) : t('Other questions is switched off — {n} rows wait behind the fold', { n: o.n }))).join(' · ') : '';
      if (offWords) {
        if (!note) { note = mk('div', 'ut-band-off'); bar.after(note); }
        if (note.textContent !== offWords) note.textContent = offWords;
      } else if (note) note.remove();
      reconcileRows(g, b.entries.map((e) => ({ ...e, band: b.band })), note || bar);
      // THE FOLD (decision 1) IS A TOGGLE IN ITS OWN SLOT (lane attention-predicate-shared — the owner 2026-10-19, 「很容易误触」):
      // the bar's right end holds it for the whole open — 「还有 N 条 — 展开」 ⇄ 「收起」, one fixed width; 「全部标为已看」 keeps its own
      // slot left of it. Nothing held back any more (the folded rows resolved elsewhere) ⇒ the toggle hides but KEEPS its slot,
      // so no destructive control ever slides into a spot a fold button just vacated.
      let fe = bar.querySelector(':scope > .ut-fold');
      if (b.foldable) {
        if (!fe) { fe = mk('button', 'ut-fold'); fe.type = 'button'; bar.append(fe); }
        fe.dataset.band = String(b.band);
        const live = b.expanded || b.hidden > 0;
        fe.dataset.state = b.expanded ? 'open' : 'folded';
        const words = b.expanded ? t('Show less') : t(FOLD_HEAD, { n: b.hidden });
        if (live && fe.textContent !== words) fe.textContent = words;
        fe.setAttribute('aria-expanded', String(b.expanded));
        fe.disabled = !live;
        const vis = live ? '' : 'hidden';
        if (fe.style.visibility !== vis) fe.style.visibility = vis;
        if (bar.lastElementChild !== fe) bar.append(fe);
      } else if (fe) fe.remove();
    }
    for (const g of existing.values()) { open.delete(g.dataset.band); g.remove(); }
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
  const renderNotices = (nBox, entries, st = null) => { // `st` = the phone page's state (its own group order); null = the popup's
    // THE FILTER IN FORCE IS ALWAYS A DRAWN CHIP (r2, verifier: a stored choice
    // whose group was absent at open showed All — then a broadcast carrying one
    // notice of that origin silently re-applied it and every other group
    // vanished under an active All chip with no click). Once the store has
    // loaded (an open before the first load has no notices to judge by), the
    // held filter goes through noticeFilterFor and its answer becomes the
    // filter — held for this open and stored for the device, so the strip and
    // the store agree and an arrival never changes the filter in force.
    if (knownIds !== null) { const eff = noticeFilterFor(noticeFilter, entries); if (eff !== noticeFilter) setNoticeFilter(eff); }
    const groups = noticeGroups(entries, noticeFilter, { prev: st ? st.noticeOrder : noticeOrder });
    const order = groups.map((g) => g.origin);
    if (st) st.noticeOrder = order; else noticeOrder = order;
    patchChips(nBox.querySelector(':scope > .ut-chips'), noticeChips(entries, { prev: order }), noticeFilter);
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
  /** The notices under the bands — a GREY COUNT that opens in one click (lane foryou-folds); open: grouped by ORIGIN
   *  behind the filter strip (B-328d). `open` = drawn open; `st` = the phone page's state (null = the popup's). */
  const paintNotices = (nBox, notices, open, st = null) => {
    nBox.style.display = notices.length ? '' : 'none';
    const nHead = nBox.querySelector(':scope > .ut-notice-head');
    nHead.querySelector(':scope > .ut-head-sub').textContent = t('{n} for your information', { n: notices.filter((e) => !e.resolved).length });
    if (nHead.getAttribute('aria-expanded') !== String(open)) nHead.setAttribute('aria-expanded', String(open));
    if (nBox.classList.contains('ut-notices-open') !== open) nBox.classList.toggle('ut-notices-open', open); // closed: the strip and the groups are not drawn (style.css)
    renderNotices(nBox, notices.map((e) => ({ item: e.item, resolved: e.resolved, notice: true })), st);
  };
  const setNoticeFilter = (origin) => {
    noticeFilter = origin || 'all';
    try { localStorage.setItem(NOTICE_FILTER_KEY, noticeFilter); } catch { }
  };
  const renderPanel = () => {
    if (popup.classList.contains('hidden')) { noticeOrder = null; bands = null; noticesOpen = false; }
    if (popup.classList.contains('hidden')) { layout = null; dropRows(); return; } // a closed popup holds no rows (hidePopup, verify r7)
    if (tab === 'history') { renderHistory(); return; }
    const root = ensureInbox();
    const now = Date.now();
    // THE NOTICES keep their append-only slots by the session-group layout (PURE sortGroups — the For-you window orders
    // by the same function); STABLE ORDER WHILE OPEN (inc-mtw02kbq-kj96): a resolved row stays in its slot, dimmed with
    // ↺, until the popup closes (the next open rebuilds it sorted).
    const gs = sortGroups(todos.open);
    layout = layout ? nextLayout(layout, todos) : openLayout(gs);
    // THE ATTENTION LIST (lane foryou-folds): the bands' slots — the first 6 rows shown, the rest folded by band,
    // append-only while open (PURE bandLayout / bandEntries over src/attention-model.js needsMe)
    bands = bandLayout(todos, { now, prev: bands, policy: attnPolicy() });
    bandOff = bands.off || [];
    const drawn = bandEntries(bands, todos);
    const inPlace = new Set([...layout.groups.flatMap((g) => g.ids), ...bands.bands.flatMap((b) => b.ids)]);
    const allRows = entriesFor(layout, todos).map((g) => [g.key, g.entries, g.openCount]);
    // NOTICES (2.369.118): for-your-information rows leave the list for a section of their own under the bands
    const { notices } = splitNotices(allRows);
    const openActions = badgeOf(todos.open, now, attnPolicy()).open.length;
    root.querySelector(':scope > .ut-title > .ut-head-sub').textContent = openActions ? t('{n} open', { n: openActions }) : t('all clear');
    drawBands(root.querySelector(':scope > .ut-bands'), drawn);
    root.querySelector(':scope > .ut-empty').style.display = drawn.length ? 'none' : '';
    // notices — a GREY COUNT that opens in one click (lane foryou-folds); open: grouped by ORIGIN behind the filter strip (B-328d)
    paintNotices(root.querySelector(':scope > .ut-notices'), notices, noticesOpen);
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
    if (homeShown()) roots.push(home); // …and so does the phone's page (lane phone-first-screen)
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
    // THE model's POST: both outcomes reach the user as a toast (no silent
    // failures); on a failure the box keeps its text
    const sent = await model.postReply(id, body);
    delete row.dataset.sending;
    if (sent && !chip) { const box = row.querySelector(':scope > .ut-body > .ut-reply'); if (box) box.remove(); }
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
    if (wid) add(model.keyForWebui(wid));
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
    const now = Date.now();
    for (const winId of [...app.wm.windows.keys()]) {
      const keys = keysForWin(winId);
      const b = keys ? inboxBadgeFor(todos.open, keys, now, attnPolicy()) : { count: 0, urgency: '' }; // lane foryou-folds: that conversation's rows in bands 1–4
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
    // §9: this session's inbox as a WINDOW (scoped to it) — the same ⤢ the rows carry
    const ow = mk('button', 'ut-act ut-open-win', '⤢');
    ow.type = 'button';
    ow.title = t('Open this session\'s inbox as a window');
    ow.setAttribute('aria-label', ow.title);
    head.append(dot, mk('span', 'ut-mini-title', t('Inbox for this session')), name, ow);
    const rows = mk('div', 'ut-mini-rows');
    const empty = mk('div', 'empty-hint ut-mini-empty', t('all clear'));
    pop.append(head, rows, empty);
    pop.addEventListener('click', (e) => {
      if (fyPress(e, () => pop.remove())) return; // lane foryou-attachments: a chip / a link in the words
      if (e.target.closest('.ut-detail-exp')) return;
      if (e.target.closest('.ut-mini-head > .ut-open-win')) { pop.remove(); app.openInbox({ sessionKey: primaryKey(mini?.keys || keys) }); return; }
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
    pop.addEventListener('contextmenu', rowMenu);
    mini = { pop, winId, keys, layout: null, rows, dot, name, empty };
    renderMini();
    return pop;
  };
  app.openMiniInbox = openMiniInbox;
  app._syncInboxBadges = scheduleBadges;

  const togglePopup = (anchor) => {
    popup.classList.toggle('hidden');
    tab = 'inbox'; // default page on every open (user spec)
    bands = null; noticesOpen = false; // lane foryou-folds: the bands' slots and folds are per open, like the layout
    noticeOrder = null; // …and so is the notice groups' order (the FILTER is per device and stays)
    noticeFilter = readFilter(); // …read afresh from the device on every open (another tab may have chosen), then HELD (renderNotices)
    // a fresh open re-sorts (the layout is append-only only WHILE open) and
    // builds a fresh skeleton; a closed popup keeps nothing but the drafts
    if (!popup.classList.contains('hidden')) { layout = null; popup.replaceChildren(); popup.scrollTop = 0; } // lane foryou-folds: an open starts at the FIRST screen (the persistent element kept the last open's scroll)
    renderPanel();
    // Anchor to the button's CURRENT position — customize mode can move it to
    // any bar, so the old fixed bottom-right CSS pointed nowhere.
    if (!popup.classList.contains('hidden')) anchorFixedPopup(popup, anchor);
    // lane browser-propose verify r1: the row pass above sampled every Allow / Approve BEFORE the anchor placed the popup —
    // so the first press after an open always read as "moved under the pointer" (reproduced in chrome: sampled at 696 px,
    // pressed at 709 px after 900 ms still). Sample again where the popup now IS: its buttons are armed from the open.
    if (!popup.classList.contains('hidden')) armExitButtons();
  };
  btn.onclick = () => togglePopup(btn);
  if (mBtn) mBtn.onclick = () => togglePopup(mBtn);
  // an outside press hides the popup — THE ONE closer (utils.js onOutsidePress: capture-phase pointerdown, so a press
  // into an app's picture counts too; lane M). A PERSISTENT element: armed once for the app's life. Its rules, kept:
  // the nav button is exempt like the taskbar one — a press on it would hide the popup and the click would re-open it
  // (a tap that never closes); the title-bar mini inbox (chunk 3) is a layer ABOVE the panel, not outside it; any
  // other popover is outside (the panel never honoured the chained-popover rule)
  onOutsidePress(popup, hidePopup, {
    exclude: [btn, mBtn],
    // a row's own menu (right-click → Clear content…) and the confirm dialog it opens are ABOVE the panel too
    ignore: (t) => !!t?.closest?.('.ut-mini-popover, .win-inbox-badge, .context-menu, #record-clear-dialog'),
    nested: false, once: false,
  });
  // Escape closes the popup / phone sheet (verifier r2). This is a PERSISTENT
  // element, so it cannot carry [data-popover] — the global handler (app.js
  // _setupDialogs) REMOVES those nodes. Layer-by-layer like that handler,
  // and explicitly ordered: this listener runs in the CAPTURE phase (before
  // the global bubble one) and DEFERS whenever a transient layer sits above
  // the sheet — an open [data-popover] or any visible .dialog-overlay (the
  // static #dialog-overlay or a createModalShell modal such as the reset-credit
  // dialog) — so one Escape closes exactly one layer; a terminal keeps its own
  // Esc. (A modal's own stopPropagation cannot order it: this capture listener
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
    // createModalShell overlay (the reset-credit dialog, a layout-history
    // modal…; the retired ⤢ viewer was the r1 case): a capture listener on
    // document runs BEFORE the modal's own keydown, so without this one
    // Escape closed two layers (inbox r1).
    for (const o of document.querySelectorAll('.dialog-overlay')) if (!o.classList.contains('hidden')) return;
    const box = e.target?.closest?.('.ut-reply');
    if (box && popup.contains(box)) { foldBox(box); e.preventDefault(); e.stopPropagation(); return; }
    hidePopup();
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
  // A ROW'S MENU (right-click; a long-press on touch is a contextmenu too — utils
  // installLongPressContextMenu): "Clear content…" (2026-09-28) through THE model's
  // verb (the ONE confirm dialog, then the store's broadcast repaints the row in place).
  // A reply box is a place to type — its own native menu stays.
  function rowMenu(e) {
    if (e.target.closest('.ut-reply')) return;
    const row = e.target.closest('.ut-item');
    const items = row ? model.menuFor(row.dataset.id) : [];
    if (!items.length) return;
    e.preventDefault(); e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, items);
  }
  popup.addEventListener('contextmenu', rowMenu);
  // "Mark all seen" (chunk 4; lane foryou-folds: ONE BAND's): ONE POST for the band's open rows (folded ones included)
  // ⇒ the store's setStatusMany ⇒ ONE broadcast ⇒ every row strikes IN PLACE (the slot law) and the badges recount; a
  // failure is a toast.
  const markAllSeen = async (btnEl) => {
    const bEl = btnEl.closest('.ut-band');
    const ids = (bEl && (home && home.contains(bEl) ? H.open : bandOpen).get(bEl.dataset.band)) || []; // the band where it was pressed (the popup's, or the phone page's)
    if (!ids.length || btnEl.dataset.busy === '1') return;
    btnEl.dataset.busy = '1'; btnEl.disabled = true;
    const r = await fetchJson('/api/user-todos/resolve-many', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status: 'dismissed' }) });
    delete btnEl.dataset.busy; btnEl.disabled = false;
    if (!r || !r.ok) showToast(t('Could not update {n} items: {why}', { n: ids.length, why: r && r.error ? r.error : t('server unreachable') }), { type: 'error' });
  };
  popup.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('fy-link')) { e.preventDefault(); e.target.click(); } }); // a link span is keyboard-reachable (tabindex 0)
  popup.addEventListener('click', (e) => {
    if (fyPress(e, hidePopup)) return; // lane foryou-attachments: a chip / a link in the words opens what it names, never the row's jump
    // §9: the whole inbox as THE window (the popup steps aside for it)
    if (e.target.closest('.ut-tabs > .ut-open-win')) { hidePopup(); app.openInbox(); return; }
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
    // THE FOLD (lane foryou-folds): 「还有 N 条 — 展开」 opens its band IN PLACE (the held slots gain the band's rows); lane
    // attention-predicate-shared: the same button, now 「收起」, folds exactly those rows back (it never left its slot)
    const fb = e.target.closest('.ut-fold');
    if (fb) {
      const band = Number(fb.dataset.band);
      if (bands) bands = bandLayout(todos, { now: Date.now(), prev: bands, ...(fb.dataset.state === 'open' ? { collapse: band } : { expand: band }), policy: attnPolicy() });
      renderPanel();
      return;
    }
    // the notices' grey count opens (and closes) the notices in place
    if (e.target.closest('.ut-notice-head')) { noticesOpen = !noticesOpen; renderPanel(); return; }
    const sa = e.target.closest('.ut-seen-all');
    if (sa) { markAllSeen(sa); return; }
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
    if (sendBtn) { if (!sendBtn.disabled) { const ta = item.querySelector(':scope > .ut-body > .ut-reply textarea'); sendReply(item, ta ? ta.value : ''); } return; }
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
      // ⤢ = THE For-you window ON this item (§9: long text reads at full width,
      // replied to / handled there) — the mini inbox's opens it scoped to its session
      const rec = byId(id);
      if (!rec) return;
      if (mini) { document.querySelectorAll('.ut-mini-popover').forEach((p) => p.remove()); app.openInbox({ itemId: rec.id, sessionKey: rec.sessionKey }); }
      else { hidePopup(); app.openInbox({ itemId: rec.id }); }
      return;
    }
    if (e.target.closest('.ut-action-reset')) {
      model.runAction(todos.open.find((i) => i.id === id)); // THE producer's verb (the model maps the type)
      return;
    }
    const appBtn = e.target.closest('.ut-action-app');
    if (appBtn) {
      // design 009: the card's Install INSTALLS (the card shows the progress in place) — an Install that appeared or moved
      // under the pointer a moment ago is not the one the user read (the exit ask's V1 rule); Try again is the same click;
      // Open starts the app; Not now declines. An item filed before the card (no view) opens THE install dialog, as before.
      const rec = byId(id);
      const ans = appBtn.dataset.answer;
      if (ans === 'install' && rec && rec.card) {
        armExitButtons();
        const pv = pressVerdict({ since: appBtn._armSince ?? null, now: performance.now() });
        if (!pv.ok) { showToast(t('That Install moved under the pointer just now — read it, then press it again')); return; }
      }
      if ((ans === 'install' && !(rec && rec.card)) || ans === 'open') hidePopup();
      appBtn.disabled = true;
      Promise.resolve(model.runAction(rec, ans)).finally(() => { appBtn.disabled = false; });
      return;
    }
    const moreBtn = e.target.closest('.ut-more');
    if (moreBtn) {
      // design 009: the card's ⋯ — what used to be five buttons beside its two (Mark done and Ignore still decline it)
      const rec = byId(id);
      if (!rec) return;
      const rs = model.replyState(rec);
      const r = moreBtn.getBoundingClientRect();
      showContextMenu(r.left, r.bottom, [
        ...(rs.show && rs.enabled ? [{ label: t('Reply'), action: () => openBox(item) }] : []),
        { label: t('Mark done'), action: () => setStatus(id, 'done') },
        { label: tc('inbox', 'Dismiss'), action: () => setStatus(id, 'dismissed') },
        { label: t('Copy'), action: () => { copyText([model.wordsOf(rec), model.detailOf(rec)].filter(Boolean).join('\n\n')); showToast(t('Copied')); } },
        ...model.menuFor(id),
      ]);
      return;
    }
    const propBtn = e.target.closest('.ut-action-proposal');
    if (propBtn) {
      // lane browser-propose: the agent's proposal answered where it appears (Approve / Reject) — an Approve that appeared
      // or moved under the pointer a moment ago is not the one the user read (the exit ask's V1 rule)
      if (String(propBtn.dataset.answer || '').startsWith('pk:') && propBtn.classList.contains('ut-proposal-approve')) { // lane passkey-ui: a passkey card's primary (Allow once) obeys the same rule
        armExitButtons();
        const pk = pressVerdict({ since: propBtn._armSince ?? null, now: performance.now() });
        if (!pk.ok) { showToast(t('That Approve moved under the pointer just now — read it, then press it again')); return; }
      }
      if (propBtn.dataset.answer === 'approve') {
        armExitButtons();
        const pv = pressVerdict({ since: propBtn._armSince ?? null, now: performance.now() });
        if (!pv.ok) { showToast(t('That Approve moved under the pointer just now — read it, then press it again')); return; }
      }
      propBtn.disabled = true;
      Promise.resolve(model.runAction(todos.open.find((i) => i.id === id), propBtn.dataset.answer)).finally(() => { propBtn.disabled = false; });
      return;
    }
    const exitBtn = e.target.closest('.ut-action-exit');
    if (exitBtn && (exitBtn.dataset.answer === 'allow' || exitBtn.classList.contains('ut-exit-allow'))) { // lane hub-act-ask: Allow once / Always too
      // verify-r6 V1: an Allow that appeared or moved under the pointer a moment ago is not the one the user read
      armExitButtons();
      const pv = pressVerdict({ since: exitBtn._armSince ?? null, now: performance.now() });
      if (!pv.ok) { showToast(t('That Allow moved under the pointer just now — read it, then press it again')); return; }
    }
    if (exitBtn) {
      // lane-pairing ⑥: an exit's "ask me" answered where it appears (Allow / Deny)
      // lane key-instance-scope: an automation card's answer carries the REACH the owner picked (the card's radios; absent = opened)
      const reachPick = exitBtn.closest('.ut-item')?.querySelector('.ut-ak-reach input:checked');
      exitBtn.disabled = true;
      Promise.resolve(model.runAction(todos.open.find((i) => i.id === id), exitBtn.dataset.answer, reachPick ? { reach: reachPick.value } : {})).finally(() => { exitBtn.disabled = false; });
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

  // ── THE PHONE'S FIRST SCREEN (lane phone-first-screen, design q-044 decision 5) ─────────────────────────────────────
  // The attention list as a PAGE over the phone's window area: the bands' rows (THE row renderer, keyed, the slot law —
  // PURE bandLayout / bandEntries with the page's own slots), their fold heads and the notices' grey line; every verb is
  // the popup's (rowClick, the reply box, a row's menu). The cap is the attention list's (6) — never the viewport's.
  const homeShown = () => !!home && !home.classList.contains('hidden');
  /** Would the page show a row now? (the first screen of a fresh layout — 搁置 and the notices alone are no first screen) */
  const homeHasRows = () => !!home && bandLayout(todos, { now: Date.now(), policy: attnPolicy() }).shown.size > 0; // .319 seam: the phone page reads the owner's band switches + cap like the tray
  const renderHome = () => {
    if (!homeShown()) return;
    let root = home.querySelector(':scope > .ut-inbox');
    if (!root) { root = mk('div', 'ut-inbox ut-home'); root.append(mk('div', 'ut-groups ut-bands'), noticesEl()); home.append(root); }
    const now = Date.now();
    H.layout = H.layout ? nextLayout(H.layout, todos) : openLayout(sortGroups(todos.open)); // the notices' slots (the popup's rule)
    H.bands = bandLayout(todos, { now, prev: H.bands, policy: attnPolicy() });
    const drawn = bandEntries(H.bands, todos);
    // NO EMPTY PAGE (decision 5): every row it held left the store (a resolved row keeps its slot — only a cleared or
    // pruned one goes) — the conversation list instead
    if (!drawn.length) { hideHome(); app.sidebar?.toggle?.(true); return; }
    drawBands(root.querySelector(':scope > .ut-bands'), drawn, H.open);
    const { notices } = splitNotices(entriesFor(H.layout, todos).map((g) => [g.key, g.entries, g.openCount]));
    paintNotices(root.querySelector(':scope > .ut-notices'), notices, H.noticesOpen, H);
  };
  /** Show the page (a fresh layout from its first screen, scrolled to the top) → true; false = nothing on its first
   *  screen (the caller shows the conversation list). Already on show: repainted where it stands. */
  const showHome = () => {
    if (!home) return false;
    if (!homeShown()) {
      if (!homeHasRows()) return false;
      Object.assign(H, { layout: null, bands: null, noticesOpen: false, noticeOrder: null });
      H.open.clear();
      home.replaceChildren();
      home.classList.remove('hidden');
      home.scrollTop = 0;
      document.body.classList.add('phone-home-on'); // the nav's ✕ closes the ACTIVE window — hidden while the page covers it (style.css)
      app._updateMobileNavTitle?.();
    }
    renderHome();
    armExitButtons(); // sampled where the page now IS (the popup's open does the same)
    return homeShown();
  };
  /** Hide the page: its rows leave the DOM with it (a typed reply is kept as a draft first — the popup's rule, verify r7). */
  const hideHome = () => {
    if (!homeShown()) return;
    home.classList.add('hidden');
    stashDrafts(home);
    home.replaceChildren();
    Object.assign(H, { layout: null, bands: null });
    H.open.clear();
    document.body.classList.remove('phone-home-on');
    app._updateMobileNavTitle?.();
  };
  if (home) {
    home.addEventListener('click', (e) => {
      if (fyPress(e, hideHome)) return; // a chip / a link in the words opens what it names (the page steps aside for its viewer)
      const chipEl = e.target.closest('.ut-chip');
      if (chipEl) { // a notice filter chip: per device (the popup's own rule), the active origin chip again = all
        const o = chipEl.dataset.origin;
        setNoticeFilter(o !== 'all' && chipEl.classList.contains('on') ? 'all' : o);
        renderHome();
        return;
      }
      const fb = e.target.closest('.ut-fold');
      if (fb) { if (H.bands) H.bands = bandLayout(todos, { now: Date.now(), prev: H.bands, expand: Number(fb.dataset.band), policy: attnPolicy() }); renderHome(); return; } // THE FOLD opens its band IN PLACE
      if (e.target.closest('.ut-notice-head')) { H.noticesOpen = !H.noticesOpen; renderHome(); return; }
      const sa = e.target.closest('.ut-seen-all');
      if (sa) { markAllSeen(sa); return; }
      if (e.target.closest('.ut-detail-exp')) return;
      const item = e.target.closest('.ut-item');
      if (item) rowClick(e, item); // the row's verbs; its body opens the conversation (jump ⇒ the page steps aside)
    });
    home.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.isComposing) { const box = e.target?.closest?.('.ut-reply'); if (box) { foldBox(box); e.preventDefault(); e.stopPropagation(); } return; } // a reply box folds (its text kept as a draft)
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('fy-link')) { e.preventDefault(); e.target.click(); return; }
      replyKeys(e);
    });
    home.addEventListener('input', growOnInput);
    home.addEventListener('contextmenu', rowMenu);
    /** THE PHONE OPENS ON THE ATTENTION LIST — once, after the boot's restore (app.ready) and the store's first snapshot;
     *  never when a `?` link opened a place, over the first-run wizard, or after the person already pressed something.
     *  An empty first screen leaves the phone where its restore put it (the conversation list is HOME — back gets there). */
    const bootHome = () => {
      if (location.search) return;
      let pressed = false;
      const press = () => { pressed = true; };
      document.addEventListener('pointerdown', press, { capture: true, once: true });
      const go = () => {
        document.removeEventListener('pointerdown', press, { capture: true });
        if (pressed || document.getElementById('welcome')?.classList.contains('onboarding')) return;
        if (showHome() && app.sidebar?.isOpen) app.sidebar.toggle(false);
      };
      if (model.loaded) { go(); return; }
      const off = model.on('todos', () => { off(); go(); });
    };
    app.phoneHome = { shown: homeShown, hasRows: homeHasRows, show: showHome, hide: hideHome, boot: bootHome };
  }

  // the For-you button the user can SEE on this device (taskbar, else the phone nav)
  const trayRect = () => {
    for (const b of [btn, mBtn]) {
      if (!b || !b.offsetParent) continue;
      const r = b.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) return r;
    }
    return null;
  };
  const apply = (next) => {
    const prevKnown = knownIds;
    todos = next || { open: [], resolved: [] };
    // Toast genuinely NEW items — click one to jump. Known ids include the
    // resolved tail, so a user reopening an item doesn't get toasted for their
    // own action. The knownIds closure survives reconnects, so a resync after
    // an offline gap toasts exactly the items that arrived meanwhile (the
    // toast stack self-caps at 4).
    if (prevKnown) {
      const now = Date.now();
      for (const i of todos.open) {
        if (prevKnown.has(i.id)) continue;
        // lane foryou-folds (design q-044 §2): only an arrival in band 1 or 2 (urgent, someone waiting) raises a toast and
        // blinks the button — every other one moves a number (39 toasts a day ⇒ about 3)
        if (!toastWorthy(attentionRow(i, now), attnPolicy())) continue; // (the panel's own `rowOf` is a DOM helper — the attention row is imported under its own name; a band switched off never toasts)
        // lane S3: the toast says WHERE the tray is ("Added to For you (bottom
        // right)") — measured off this device's own button, once per item
        const where = trayWhere(trayRect(), window.innerWidth, window.innerHeight);
        const head = where ? t('Added to For you ({where})', { where: t(where) }) : t('Added to For you');
        // the history keeps the HEAD + the item's id — never its words (lane-redact verify r4) NOR its label: a Background
        // Work ask's label (`sessionName`, what nameFor() falls back to) IS the job's name (verify r5, reproduced in chrome);
        // the label and the words are looked up live wherever the entry is shown
        const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i)}`, { history: { m: head, ref: { kind: 'todo', id: i.id } } });
        if (el) { el.dataset.todoId = i.id; el.dataset.todoHead = head; }
        // the click keeps the item's ID and key, never the item (lane-redact verify r5, a heap snapshot: the toast's handler
        // kept the original record — its words — reachable for the toast's life after a clear); it jumps with the LIVE record
        if (el) { const id = i.id, key = i.sessionKey; el.style.cursor = 'pointer'; el.onclick = () => jump(key, byId(id)); }
        if (el) el.querySelector('.global-toast-body').classList.add('global-toast-tap');   // B-a42d: the ONE toast a body tap opens — its words, never the whole toast
        btn.classList.remove('ut-blink'); void btn.offsetWidth; btn.classList.add('ut-blink');
      }
    }
    knownIds = new Set([...todos.open, ...todos.resolved].map((i) => i.id));
    // A TOAST ON SCREEN IS A SURFACE TOO (lane-redact verify r5): an arrival toast keyed on its item is re-worded from the
    // CURRENT record on every snapshot — a cleared item's toast reads the sentence for the rest of its life (≤ 60 s)
    for (const el of document.querySelectorAll('#global-toasts > .global-toast[data-todo-id]')) {
      const it = byId(el.dataset.todoId);
      const b = el.querySelector('.global-toast-body');
      if (!it || !b || typeof el.dataset.todoHead !== 'string') continue;
      const want = `${el.dataset.todoHead} · ${nameFor(it.sessionKey, [it])}: ${wordsOf(it)}`;
      if (b.textContent !== want) b.textContent = want;
    }
    renderBtn(); renderPanel(); renderMini(); scheduleBadges(); renderHome();
  };

  // THE MODEL'S THREE BROADCASTS (§9 — the subscriptions, the reconnect resync and
  // the first fetch live in src/lib/user-todos-actions.js; this surface paints):
  // every snapshot ⇒ apply; the live facts (D1.7: the session list's own
  // broadcast) ⇒ the running dot and the reply controls patched in place, rows
  // never re-rendered for it (lane foryou-folds: the board chips left with the group heads — a blocked board now PLACES
  // the row, in band 2)
  model.on('todos', (next) => apply(next));
  model.on('live', () => { patchLive(); scheduleBadges(); });
  // lane attention-predicate-shared (decision 4): A SWITCH OR THE CAP CHANGED (here or on another client — the settings
  // broadcast) ⇒ the badge, the title-bar badges and an open popup re-render at once; the open popup's slots are rebuilt
  // (a switch moves rows between bands — the slot law holds only while the policy does)
  const onPolicy = () => { bands = null; renderBtn(); scheduleBadges(); if (!popup.classList.contains('hidden')) renderPanel(); };
  for (const b of BANDS) app.settings?.on?.(bandKey(b.code), onPolicy);
  app.settings?.on?.(CAP_KEY, onPolicy);
  if (model.loaded) apply(model.todos); // a model built before this surface (the window opened first) already holds a snapshot
  // A toast fired while the history page is open → live-refresh it
  // (and on the inbox page the Notifications tab's unread count ticks up in place)
  window.addEventListener('vs-toast', () => { if (popup.classList.contains('hidden')) return; if (tab === 'history') renderPanel(); else patchTabs(); });
  renderBtn();
}
