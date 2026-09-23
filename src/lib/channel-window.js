// THE CHANNEL CONVERSATION WINDOW (docs/design-communication-panel.zh.md
// §10.1, §10.3; the a4 UI design docs/design-communication-panel-ui.md §4.2).
// A registered WINDOW TYPE, so layout restore, cross-client sync, virtual
// desktops, tab groups and the taskbar all work for free and `replayOpenSpec`
// cannot silently drop it (the registry has a loud default).
//
// THE BAR IS THREE TIERS WITH A RHYTHM (a1 W2): title 13/600 + ONE ⋯ button
// (the `channel-row` contribution menu — Assign & filter… / Reach & policy… /
// Track / Mark read — with the same ctx the panel's row menu uses), the meta
// line 11 dim (adapter label · participants · freshness), and the assignment
// as an accent-tint CHIP that opens the editor. No verbs at title weight.
//
// THE LIST reads like a chat, not a form (a1 W4): a day separator when the
// day changes, consecutive lines by the same author within 5 minutes grouped
// under one head, an agent's name in the accent text tone.
//
// TWO RULES GOVERN WHAT IT DRAWS:
//
// 1. EVERY VENDOR STRING IS HOSTILE INPUT (fence 5). A Lark body and a Gmail
//    part are peer-controlled and sync to every client, so v1 renders PLAIN
//    TEXT through textContent — no innerHTML on any path, and no markdown
//    parse of a stranger's message. (The sanitizer is good; the attack
//    surface is the point. Rich rendering is a later phase and its home is the
//    published-pages sandbox-iframe pattern, not our own DOM.)
//
// 2. THE SEND CONTROL EXISTS ONLY IF `offers()` SAYS SO. That answer is the
//    server's, resolved from BOTH the adapter's static `caps` and this
//    conversation's own `convCaps` — and `unknown` renders as "not offered +
//    the reason", never as "allowed". On a read-only conversation there is NO
//    composer element at all: a disabled control the user can see but not use
//    invites the question "why?", and the honest answer belongs in the
//    footer beside the conversation it is about.
//
// THE OWNER'S OWN MESSAGE GOES OUT DIRECTLY (design §22.2 ①, g3 — "an IM,
// not a feed"): where the conversation offers `sendAsUser` the composer is a
// SEND, as you, at once (`POST …/send`: no policy, no approval card — those
// are for AGENT drafts, which keep the inline outbox cards). Where only the
// bot identity is offered, a message would not be the owner speaking, so the
// composer PROPOSES (P3) and says why sending as you is not offered here. The
// identity warning lives ON THE CARD (once, only when it warns), never as a
// standing line under the composer (a1 W1). An AGENT GROUP (the same window
// type, `adapterId` = the group namespace) is drawn by `openGroupWindow`
// below: its composer sends as You, @name wakes.
import { fetchJson, showToast, showContextMenu } from './utils.js';
import { t, deviceLocale } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { menuItems } from './contributions.js';
import { icon, el, btn } from './channel-chrome.js';
// P2: the Assign & filter editor and the one-line summary the bar draws.
import { showAssignFilterDialog, assignmentSummary } from './channel-filter-editor.js';
// P3: the inline approval cards (the SAME renderer the Outbox window uses —
// one store, two places, §9.2).
import { renderInlineProposals, reasonLabel } from './channel-outbox.js';
// a3 i18n: a route failure is worded by its CODE, never by the engine's sentence.
import { routeErrorText } from './channel-words.js';
// PURE, bundled directly (the task-color-seq / quota-model pattern): the
// server sends STRUCTURE and the sentence is composed HERE, because the
// digest is broadcast to every client while the language is per DEVICE.
import * as chanCaps from '../channel-caps.js';
// g3 (design §22): the composer's mode by conversation kind, the @-autocomplete,
// the wake preview, and the group dialogs + words.
import { composerMode, isGroupConv, mentionQuery, mentionCandidates, insertMention, wakePreview, OWNER } from './channel-groups-view.js';
import { showGroupDetail, showGroupMembersDialog, renameGroup, archiveGroup } from './channel-group-dialogs.js';
import { groupErrorText, wakeEchoText } from './channel-words.js';

const ICON = svgIcon16('<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>');

const PAGE = 50;
/** Consecutive lines by the same author within this window share one head. */
const GROUP_MS = 5 * 60e3;

const stamp = (ms) => {
  const d = new Date(Number(ms) || 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** The local calendar day of an instant — the separator's key. */
const dayKey = (ms) => {
  const d = new Date(Number(ms) || 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** The separator's words: today / yesterday / the date in the DEVICE's language
 *  (`deviceLocale()` — the app's language choice, never the browser's: a zh/ja
 *  device on an en browser drew "Sep 22" between zh messages; the census caught it). */
function dayLabel(ms, now = Date.now()) {
  const k = dayKey(ms);
  if (k === dayKey(now)) return t('Today');
  if (k === dayKey(now - 86400e3)) return t('Yesterday');
  try { return new Date(Number(ms) || 0).toLocaleDateString(deviceLocale(), { month: 'short', day: 'numeric' }); } catch { return k; }
}
const authorKey = (rec) => (rec.author && (rec.author.id || rec.author.name)) || '';

/** ONE row. EVERYTHING is textContent — see rule 1. `cont` = a continuation
 *  of the previous author's run (no head, tighter). */
function renderRecord(rec, { cont = false } = {}) {
  const row = el('div', 'chanmsg' + (cont ? ' chanmsg-cont' : '') + (rec.author && rec.author.isBot ? ' chanmsg-agent' : ''));
  row.dataset.at = String(rec.at || 0);
  row.dataset.author = authorKey(rec);
  if (!cont) {
    const head = el('div', 'chanmsg-head');
    const who = el('b', '', (rec.author && rec.author.name) || (rec.author && rec.author.id) || t('unknown'));
    const when = el('span', 'chanmsg-at', stamp(rec.at));
    head.append(who, when);
    if (rec.raw && rec.raw.synthetic) {
      // A scraped source mints its own key. Saying so on the row is the same
      // honesty the freshness chip owes: the reader should know which evidence
      // this line came from.
      const s = el('span', 'chanmsg-syn', t('scanned'));
      s.title = t('This message has no vendor id — the adapter minted a stable key from its content.');
      head.appendChild(s);
    }
    row.appendChild(head);
  }
  row.appendChild(el('div', 'chanmsg-body', rec.text || ''));
  return row;
}
function daySeparator(ms) {
  const d = el('div', 'chanmsg-day', dayLabel(ms));
  d.dataset.day = dayKey(ms);
  return d;
}

/**
 * Open (or focus) the window for ONE conversation. Singleton PER CONVERSATION
 * — the registry's `singleton` flag is per KIND, which is not what we want:
 * two different conversations are two windows, the same one twice is not.
 */
export function openChannelWindow(app, adapterId, convId, opts = {}) {
  // `_openSpec` is where WindowManager.createWindow parks it (window.js:125) —
  // the underscore is the storage, not a private we are reaching around.
  const key = `${adapterId}/${convId}`;
  for (const [id, w] of app.wm.windows || []) {
    const spec = w && w._openSpec;
    if (spec && spec.action === 'openChannel' && `${spec.adapterId}/${spec.convId}` === key) {
      app.wm.focusWindow(id);
      return w;
    }
  }
  const winInfo = app.wm.createWindow({
    title: t('Channel'), type: 'channel', syncId: opts.syncId,
    openSpec: { action: 'openChannel', adapterId, convId },
    width: 520, height: 560,
  });

  const root = el('div', 'chanwin');
  winInfo.content.appendChild(root);

  const bar = el('div', 'chanwin-bar');
  const list = el('div', 'chanwin-list');
  const foot = el('div', 'chanwin-foot');
  root.append(bar, list, foot);
  // an agent GROUP is a different object behind the same window type (g3)
  if (isGroupConv(adapterId)) { root.classList.add('chanwin-group'); return openGroupWindow(app, winInfo, convId, { bar, list, foot }); }

  // THE PAGE BOUNDARY IS A RECORD, NOT AN INSTANT (r2). `at` is not unique —
  // a Lark burst shares a millisecond, Gmail's `internalDate` is
  // second-derived — so paging on the timestamp alone made every record of
  // such a group at or after a boundary permanently unreachable.
  let oldest = null, oldestId = null;
  /** The conversation summary the last render drew — the ONLY thing the
   *  pointer handler consults, so it never POSTs about a stale unread. */
  let lastConv = null;

  async function renderBar() {
    const r = await fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}`);
    bar.textContent = '';
    if (!r || r.error) {
      bar.appendChild(el('div', 'chanwin-err', (r && r.error) || t('This conversation is not available.')));
      lastConv = null;
      return null;
    }
    const c = r.conversation;
    lastConv = c;
    // The MANAGER owns titles (`wm.setTitle` updates the bar, the taskbar
    // and a tab label). `winInfo.setTitle?.(…)` was a permanent no-op (r3):
    // the winInfo literal has no such member, so every channel window read
    // "Channel" and two open conversations were indistinguishable — the same
    // silent-optional-call shape as the `off?.()` r2 removed.
    app.wm.setTitle(winInfo.id, c.title || convId);
    const titleRow = el('div', 'chanwin-title-row');
    titleRow.appendChild(el('b', '', c.title || convId));
    // the ONE control at title height: the row menu (the panel's contribution
    // menu, same ctx) — Assign & filter… / Reach & policy… / Track / Mark read
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'icon-btn';
    more.title = t('More actions');
    more.appendChild(icon('more', 13));
    more.onclick = (ev) => { ev.stopPropagation(); const rr = more.getBoundingClientRect(); showContextMenu(rr.left, rr.bottom + 2, menuItems('channel-row', { app, conv: c, inWindow: true })); };
    titleRow.appendChild(more);
    bar.appendChild(titleRow);
    const bits = [c.adapterLabel || c.adapterId];   // the adapter's LABEL, never its id (a3 i18n)
    if (c.participants) bits.push(c.participants);
    const fresh = chanCaps.freshnessText(c.freshness, { t });
    if (fresh) bits.push(fresh);
    const meta = el('div', 'chanwin-meta', bits.join(' · '));
    meta.title = t('How fresh this row is — the lane actually carrying it, not the one the adapter declares.');
    bar.appendChild(meta);
    // P2: the assignment as a CHIP (a tracked row only — nothing is fetched
    // for an untracked one, so nobody could be woken); it opens the editor.
    if (c.tracked) {
      const held = !!(c.stats && c.stats.lastWake && c.stats.lastWake.ok === false);
      const chipEl = document.createElement('button');
      chipEl.type = 'button';
      chipEl.className = 'chan-assign-chip' + (c.assignment ? (held ? ' chan-warn' : '') : ' chan-assign-none');
      chipEl.dataset.channelAssign = '1';
      chipEl.appendChild(icon(c.assignment ? 'filter' : 'plus', 10));
      // unassigned: the chip is the VERB (short); the fact rides its tooltip
      chipEl.appendChild(el('span', '', c.assignment ? assignmentSummary(c) + (held ? ' · ' + t('last wake held') : '') : t('Assign to an agent…')));
      chipEl.title = held ? t('Last wake was held or stashed: {why}', { why: chanCaps.wakeRefusalText(c.stats.lastWake.refused, { t }) || c.stats.lastWake.why || '' }) : (c.assignment ? t('Assign & filter…') : t('Not assigned — nobody is woken by this conversation.'));
      chipEl.onclick = () => showAssignFilterDialog(app, c);
      bar.appendChild(chipEl);
    }

    // The send half by the capability row (g3): DIRECT as you, the proposal
    // path when only the bot identity is offered, or NOT offered WITH its
    // reason (never silence).
    const cm = composerMode({ conv: c });
    if (cm.mode === 'direct' || cm.mode === 'propose') {
      const direct = cm.mode === 'direct';
      // r3: a send that STARTS A TURN (the adapter declares `sendStartsTurn` —
      // the built-in Agents adapter's send wakes that agent) says its cost
      // before the click and echoes it with the Send (`expectWakes`)
      const wakes = r.adapter && r.adapter.sendStartsTurn ? 1 : 0;
      const comp = el('div', 'chanwin-composer');
      comp.dataset.channelSend = '1';
      const ta = document.createElement('textarea');
      ta.placeholder = direct ? t('Write a message — it is sent at once, as you') : t('Write a reply…');
      ta.rows = 2;
      const row = el('div', 'chanwin-composer-row');
      const pol = direct
        ? (wakes ? t('Sent at once, as you — it wakes this agent: 1 billed turn.') : t('Sent at once, as you — no policy, no approval. The outbox holds only replies an agent drafts.'))
        : `${t('Sending as you is not offered here ({why})', { why: chanCaps.sendWhyText(cm.why, { t }) })} — ${c.policy && c.policy.mode === 'direct' ? t('Policy: direct — your reply is sent at once unless a guard (link, attachment, off-hours) sends it to the outbox for approval.') : t('Policy: review — your reply waits in the outbox for your approval.')}`;
      const note = el('div', 'chanwin-note' + (wakes && direct ? ' chan-warn' : ''), pol);
      const sendBtn = btn(direct ? t('Send') : t('Propose'), null, 'mounts-btn-primary');
      if (direct) { sendBtn.dataset.channelDirect = '1'; sendBtn.prepend(icon('send', 11)); } else sendBtn.dataset.channelPropose = '1';
      sendBtn.onclick = async () => {
        const text = ta.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        const r2 = await fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}/${direct ? 'send' : 'propose'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, expectWakes: wakes }) });
        sendBtn.disabled = false;
        if (!r2 || r2.error) { showToast(routeErrorText(r2), { type: 'error' }); return; }
        ta.value = '';
        const st = r2.proposal && r2.proposal.state;
        // the policy's reasons are an ENUM — worded through the card's own `reasonLabel` (a3 i18n)
        if (st === 'failed') showToast(t('The channel refused the send: {error}', { error: (r2.proposal && r2.proposal.reason) || '' }), { type: 'error' });
        else if (st === 'unknown') showToast(t('The send left but its answer was lost — check the conversation on the platform'), { type: 'warn' });
        else showToast(st === 'sent' ? t('Sent') : st === 'awaiting-approval' ? t('Held in the outbox for your approval ({why})', { why: ((r2.decision && r2.decision.reasons) || []).map(reasonLabel).join('; ') }) : t('Proposal {state}', { state: st || '?' }));
      };
      ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });
      row.append(note, sendBtn);
      comp.append(ta, row);
      foot.textContent = '';
      foot.appendChild(comp);
    } else {
      // NO composer element at all — the P0 exit condition.
      foot.textContent = '';
      const ro = el('div', 'chanwin-readonly');
      if (!c.tracked) {
        // An UNTRACKED conversation is not "capability unknown" — nothing was
        // fetched, so nothing could be known (§10 invariant 6; a1 §2.2 W3):
        // the honest footer names the fact and carries the verb.
        ro.appendChild(el('span', '', t('Not tracked — messages are fetched once you track it.')));
        const tb = btn(t('Track this conversation'), null);
        tb.onclick = async () => {
          tb.disabled = true;
          const r2 = await fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracked: true }) });
          if (!r2 || r2.error) { tb.disabled = false; showToast(routeErrorText(r2), { type: 'error' }); }
        };
        ro.appendChild(tb);
      } else {
        const why = (c.offers && c.offers.sendAsUser.why) || 'unknown';
        // P4: the reason in words (a `send-scope-not-granted` answer says what
        // unlocks sending — never a greyed control), never a bare code.
        ro.appendChild(el('span', '', t('Read-only here ({why})', { why: chanCaps.sendWhyText(why, { t }) })));
      }
      foot.appendChild(ro);
    }
    return c;
  }

  /** Drop a day separator that repeats the one before it (a prepended page
   *  can end on the day the existing list began). */
  function dedupeDays() {
    let prev = null;
    for (const node of [...list.querySelectorAll('.chanmsg-day')]) {
      if (prev && prev.dataset.day === node.dataset.day) node.remove(); else prev = node;
    }
  }

  async function loadPage({ prepend = false } = {}) {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (prepend && oldest !== null) {
      q.set('before', String(oldest));
      // BOTH halves of the boundary — the store orders by (at, vendorId).
      if (oldestId) q.set('beforeId', String(oldestId));
    }
    const r = await fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}/messages?${q}`);
    if (!r || r.error) return 0;
    const recs = r.records || [];
    if (!recs.length) return 0;
    // The page arrives oldest-first in the SAME order the store pages by, so
    // its first element IS the boundary for the next page up.
    const head = recs[0];
    oldest = Number(head.at) || 0;
    oldestId = head.vendorId || null;
    const frag = document.createDocumentFragment();
    let prev = null;
    for (const rec of recs) {
      if (!prev || dayKey(prev.at) !== dayKey(rec.at)) frag.appendChild(daySeparator(rec.at));
      const cont = !!prev && dayKey(prev.at) === dayKey(rec.at) && authorKey(prev) === authorKey(rec) && (Number(rec.at) - Number(prev.at)) < GROUP_MS && !(rec.raw && rec.raw.synthetic);
      frag.appendChild(renderRecord(rec, { cont }));
      prev = rec;
    }
    if (prepend) list.insertBefore(frag, list.firstChild); else list.insertBefore(frag, outboxSec.isConnected ? outboxSec : null);
    dedupeDays();
    return recs.length;
  }

  /**
   * MARKING READ IS A USER ACTION, NOT A REPAINT SIDE EFFECT (r2).
   *
   * This POST used to live at the end of `render()`, which the broadcast
   * handler calls — so the engine's own notify re-rendered the window, the
   * render POSTed /read, the POST notified, and the cycle ran at ~490
   * requests a second for ever with the user touching nothing, rewriting
   * `readAt` ~500 times a second and destroying the very mark it set.
   * It is called when the window OPENS and when it is FOCUSED, both of which
   * are things the user did.
   */
  let readInFlight = false;
  function markRead() {
    if (readInFlight) return;
    readInFlight = true;
    fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .catch(() => {}).finally(() => { readInFlight = false; });
  }

  // P3: this conversation's proposals, rendered INLINE from the same store
  // the Outbox window reads (§9.2). Re-read on `channel-outbox-updated`.
  const outboxSec = el('div', 'chanwin-outbox-slot');
  async function renderOutbox() {
    const r = await fetchJson(`/api/channels/outbox?conv=${encodeURIComponent(`${adapterId}/${convId}`)}`);
    outboxSec.textContent = '';
    if (!r || r.error) return;
    const sec = renderInlineProposals(app, r.proposals || []);
    if (sec) outboxSec.appendChild(sec);
  }

  async function render({ read = false } = {}) {
    const c = await renderBar();
    if (!c) return;
    list.textContent = '';
    oldest = null; oldestId = null;
    const n = await loadPage({});
    if (!n) list.appendChild(el('div', 'chanwin-empty', c.tracked ? t('No messages yet.') : t('Not tracked — nothing is fetched for this conversation until you track it.')));
    list.appendChild(outboxSec);
    await renderOutbox();
    list.scrollTop = list.scrollHeight;
    if (read && c.tracked && c.unread) markRead();
  }

  // Paging upward: one page per top-scroll, oldest-first (the same shape the
  // panel and the chat view use — a window never loads a 90-day log whole).
  list.addEventListener('scroll', () => {
    if (list.scrollTop > 4) return;
    const before = list.scrollHeight;
    loadPage({ prepend: true }).then((n) => { if (n) list.scrollTop = list.scrollHeight - before; }).catch(() => {});
  });

  // Multi-client: the engine broadcasts ONE recomputed digest per pass, and a
  // window re-reads its own tail when its id is named (§10.4). It never marks
  // read from here — see markRead().
  //
  // THE HANDLER IS HELD IN A NAMED CONST AND REMOVED BY NAME (r2). `off?.()`
  // on the result of `onGlobal` was a silent no-op for as long as that method
  // returned undefined, so a CLOSED window kept re-rendering, kept fetching
  // and kept POSTing /read over the user's mark — plus its whole detached DOM
  // subtree.
  //
  // THE LOAD-BEARING HALF IS `onGlobal` RETURNING ITS OWN UNSUBSCRIBE (src/lib/ws.js)
  // — MEASURED: with that restored and this spelled `off?.()` again the e2e
  // leg is ALL PASS, so this form is a BELT, not a second protection. It is
  // here because a teardown that silently depends on a return value nobody
  // asserts is exactly how the class came back the first time; the contract
  // itself is pinned by test-channels-e2e ⑧, which goes red on that layer
  // alone.
  const onBroadcast = (msg) => {
    if (msg.type === 'channel-outbox-updated') {
      // the proposal store changed: re-read ONLY this conversation's cards
      // (the digest broadcast that follows repaints the bar)
      if (msg.outbox && Array.isArray(msg.outbox.proposals) && !msg.outbox.proposals.some((p) => p.adapterId === adapterId && p.convId === convId) && !outboxSec.firstChild) return;
      renderOutbox().catch(() => {});
      return;
    }
    if (msg.type !== 'channels-updated') return;
    if (Array.isArray(msg.changed) && msg.changed.length && !msg.changed.includes(convId)) return;
    render().catch(() => {});
  };
  app.ws.onGlobal(onBroadcast);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { app.ws.offGlobal(onBroadcast); } catch {} });

  // Touching the window is a USER action, so it may mark read; a repaint may
  // not. Bounded by construction: once the mark lands the next digest says
  // `unread: 0` and every later click is a no-op.
  winInfo.element?.addEventListener('pointerdown', () => {
    if (lastConv && lastConv.tracked && lastConv.unread) markRead();
  }, { signal: winInfo._listenerCtl?.signal });

  render({ read: true }).catch((e) => showToast(String(e && e.message ? e.message : e), { type: 'error' }));
  return winInfo;
}

// ── THE AGENT-GROUP WINDOW (design §22.5, chunk g3) ───────────────────────
// The same window type and openSpec (`{action:'openChannel', adapterId:
// GROUP_ADAPTER_ID, convId:<groupId>}`), so layout restore, sync, tabs and
// the taskbar work unchanged. What differs is the OBJECT: a group's log is
// read from `/api/channel-groups/:id/messages`, its system records (create /
// invite / leave / kick / rename / archive) are worded HERE by kind with the
// device's `t` (the record's own `text` is the agent-facing English), and the
// composer SENDS DIRECTLY AS YOU — no proposal, no outbox: the owner's own
// words go out at once (§22.2 ①), @<member> wakes that member (a billed turn
// through the spend authorizer on the server; the toast says the count), and
// a preview under the box says who THIS text would wake before the click.
// Every name, message and invite context is agent-controlled ⇒ textContent.

/** A system record in the device's words; the agent-facing `text` is the fallback. */
function groupSysText(rec, nameOf) {
  const raw = rec.raw || {};
  const by = nameOf(raw.by || (rec.author && rec.author.id));
  const member = raw.member ? nameOf(raw.member) : '';
  switch (raw.kind) {
    case 'create': return t('{by} created the group', { by });
    case 'invite': return t('{by} added {member}', { by, member });
    case 'leave': return raw.archived ? t('{member} left — the group is archived', { member }) : t('{member} left', { member });
    case 'kick': return raw.archived ? t('{by} removed {member} — the group is archived', { by, member }) : t('{by} removed {member}', { by, member });
    case 'rename': return raw.from ? t('{by} renamed the group (was "{from}")', { by, from: raw.from }) : t('{by} renamed the group', { by });
    case 'archive': return t('{by} archived the group — the log is kept', { by });
    default: return rec.text || '';
  }
}

function openGroupWindow(app, winInfo, groupId, { bar, list, foot }) {
  let group = null;
  let oldest = null;
  const seen = new Set();   // vendorIds already drawn — a broadcast's record may be one we appended from the send answer
  const nameOf = (id) => {
    if (id === OWNER) return t('You');
    const m = group && (group.members || []).find((x) => x.member === id);
    return (m && m.name) || String(id || '').slice(0, 8) || t('unknown');
  };

  function renderGroupRecord(rec, { cont = false } = {}) {
    const raw = rec.raw || {};
    if (raw.kind && raw.kind !== 'message') {
      const row = el('div', 'chanmsg chanmsg-sys');
      row.dataset.at = String(rec.at || 0);
      row.dataset.vid = rec.vendorId || '';
      row.appendChild(el('div', 'chanmsg-sys-line', `${groupSysText(rec, nameOf)} · ${stamp(rec.at)}`));
      if (raw.kind === 'invite' && raw.context) row.appendChild(el('div', 'chanmsg-ctx', raw.context));
      return row;
    }
    const self = !!(rec.author && (rec.author.isSelf || rec.author.id === OWNER));
    const row = el('div', 'chanmsg' + (cont ? ' chanmsg-cont' : '') + (self ? ' chanmsg-self' : ' chanmsg-agent'));
    row.dataset.at = String(rec.at || 0);
    row.dataset.author = authorKey(rec);
    row.dataset.vid = rec.vendorId || '';
    if (!cont) {
      const head = el('div', 'chanmsg-head');
      head.append(el('b', '', self ? t('You') : nameOf(rec.author && rec.author.id) || (rec.author && rec.author.name) || t('unknown')), el('span', 'chanmsg-at', stamp(rec.at)));
      row.appendChild(head);
    }
    row.appendChild(el('div', 'chanmsg-body', rec.text || ''));
    return row;
  }

  /** Append records (oldest-first) at the bottom or prepend a page at the top. */
  function place(recs, { prepend = false } = {}) {
    const fresh = recs.filter((r) => r && !seen.has(r.vendorId));
    if (!fresh.length) return 0;
    for (const r of fresh) seen.add(r.vendorId);
    const frag = document.createDocumentFragment();
    let prev = null;
    if (!prepend) { const tail = [...list.querySelectorAll('.chanmsg')].pop(); if (tail) prev = { at: Number(tail.dataset.at), author: { id: tail.dataset.author }, raw: { kind: tail.classList.contains('chanmsg-sys') ? 'sys' : 'message' } }; }
    for (const rec of fresh) {
      if (!prev || dayKey(prev.at) !== dayKey(rec.at)) frag.appendChild(daySeparator(rec.at));
      const isMsg = !(rec.raw && rec.raw.kind && rec.raw.kind !== 'message');
      const prevMsg = prev && !(prev.raw && prev.raw.kind && prev.raw.kind !== 'message');
      const cont = isMsg && prevMsg && dayKey(prev.at) === dayKey(rec.at) && authorKey(prev) === authorKey(rec) && (Number(rec.at) - Number(prev.at)) < GROUP_MS;
      frag.appendChild(renderGroupRecord(rec, { cont }));
      prev = rec;
    }
    list.querySelector('.chanwin-empty')?.remove();
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (prepend) list.insertBefore(frag, list.firstChild); else list.appendChild(frag);
    dedupeDaysIn(list);
    if (!prepend && stick) list.scrollTop = list.scrollHeight;
    return fresh.length;
  }

  async function loadPage({ prepend = false } = {}) {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (prepend && oldest !== null) q.set('before', String(oldest));
    const r = await fetchJson(`/api/channel-groups/${encodeURIComponent(groupId)}/messages?${q}`);
    if (!r || r.error) return { error: r || {} };
    if (r.group) group = r.group;
    const recs = r.records || [];
    if (recs.length) oldest = Number(recs[0].at) || 0;
    return { n: place(recs, { prepend }) };
  }

  function drawBar() {
    bar.textContent = '';
    app.wm.setTitle(winInfo.id, group.name || groupId);
    const titleRow = el('div', 'chanwin-title-row');
    titleRow.appendChild(el('b', '', group.name || groupId));
    const chipB = document.createElement('button');
    chipB.type = 'button';
    chipB.className = 'chan-members-chip';
    chipB.dataset.groupMembers = '1';
    chipB.appendChild(icon('users', 11));
    chipB.appendChild(el('span', '', t('{n} members', { n: (group.members || []).length })));
    chipB.title = t('Members & notifications…');
    chipB.onclick = () => showGroupDetail(app, group);
    titleRow.appendChild(chipB);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'icon-btn';
    more.title = t('More actions');
    more.appendChild(icon('more', 13));
    more.onclick = (ev) => {
      ev.stopPropagation();
      const rr = more.getBoundingClientRect();
      const items = [{ label: t('Members & notifications…'), action: () => showGroupDetail(app, group) }];
      if (!group.archivedAt) {
        if (!(group.pair && group.pair.length)) items.push({ label: t('Invite…'), action: () => showGroupMembersDialog(app, { group }) });
        items.push({ separator: true }, { label: t('Rename…'), action: () => renameGroup(group) }, { label: t('Archive'), action: () => archiveGroup(group) });
      }
      showContextMenu(rr.left, rr.bottom + 2, items);
    };
    titleRow.appendChild(more);
    bar.appendChild(titleRow);
    const names = (group.members || []).map((m) => m.name || String(m.member).slice(0, 8));
    const kind = group.pair && group.pair.length ? t('Direct conversation') : t('Agent group');
    const meta = el('div', 'chanwin-meta', [kind, t('You (observer)'), ...names].join(' · ') + (group.archivedAt ? ' · ' + t('Archived') : ''));
    meta.title = t('You see every message; each agent is woken only by its own notify mode or an @mention.');
    bar.appendChild(meta);
  }

  function drawFoot() {
    foot.textContent = '';
    const mode = composerMode({ group });
    if (mode.mode === 'archived') {
      const ro = el('div', 'chanwin-readonly');
      ro.appendChild(el('span', '', t('Archived — the log is kept, nothing new can be posted.')));
      foot.appendChild(ro);
      return;
    }
    const comp = el('div', 'chanwin-composer chan-group-composer');
    comp.dataset.groupComposer = '1';
    const ta = document.createElement('textarea');
    ta.placeholder = t('Message the group as You — @name wakes that agent');
    ta.rows = 2;
    const pop = el('div', 'chan-mention-pop');
    pop.style.display = 'none';
    const row = el('div', 'chanwin-composer-row');
    const note = el('div', 'chanwin-note', '');
    const sendBtn = btn(t('Send'), null, 'mounts-btn-primary');
    sendBtn.dataset.groupSend = '1';
    sendBtn.prepend(icon('send', 11));
    row.append(note, sendBtn);
    comp.append(pop, ta, row);
    foot.appendChild(comp);
    // the preview: who THIS text would wake — said before the click
    const preview = () => {
      const w = wakePreview(group, ta.value);
      note.classList.toggle('chan-warn', w.length > 0);
      note.textContent = w.length
        ? t('Will wake {names} — {n} billed turn(s)', { names: w.map((x) => x.name).join(', '), n: w.length })
        : t('Sent as You. Members on "next turn" read it in their next report — nobody is woken.');
    };
    // the @-autocomplete over the member list
    let q = null, cands = [], sel = 0;
    const closePop = () => { pop.style.display = 'none'; q = null; cands = []; };
    const drawPop = () => {
      pop.textContent = '';
      if (!q || !cands.length) { pop.style.display = 'none'; return; }
      cands.forEach((c, i) => {
        const it = el('div', 'chan-mention-item' + (i === sel ? ' chan-mention-on' : ''), c.name);
        it.dataset.member = c.member;
        it.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(i); });
        pop.appendChild(it);
      });
      pop.style.display = '';
    };
    const pick = (i) => {
      const c = cands[i];
      if (!c || !q) return;
      const r = insertMention(ta.value, q, c.name);
      ta.value = r.text;
      ta.setSelectionRange(r.caret, r.caret);
      closePop();
      preview();
      ta.focus();
    };
    const update = () => {
      q = mentionQuery(ta.value, ta.selectionStart);
      cands = q ? mentionCandidates(group.members || [], q.query) : [];
      sel = 0;
      drawPop();
      preview();
    };
    ta.addEventListener('input', update);
    ta.addEventListener('click', update);
    ta.addEventListener('blur', () => setTimeout(closePop, 120));
    ta.addEventListener('keydown', (e) => {
      if (pop.style.display !== 'none' && cands.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % cands.length; drawPop(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + cands.length) % cands.length; drawPop(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(sel); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendBtn.click(); }
    });
    sendBtn.onclick = async () => {
      const text = ta.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      // the count the preview SAID travels with the send (r2): the server refuses
      // `wake-count-mismatch` if the act would wake a different number
      const r = await fetchJson(`/api/channel-groups/${encodeURIComponent(groupId)}/post`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, expectWakes: wakePreview(group, text).length }) });
      sendBtn.disabled = false;
      if (!r || r.error) {
        // r3: a `wake-count-mismatch` CARRIES the view the server counted
        // against (live names — a member renamed since this window drew them):
        // repaint from it, so the preview, the @-autocomplete and the next
        // click count against the same names the server does
        if (r && r.code === 'wake-count-mismatch' && r.group && r.group.id === groupId) { group = { ...group, ...r.group }; drawBar(); preview(); }
        showToast(groupErrorText(r), { type: 'error' });
        return;
      }
      ta.value = '';
      preview();
      // the send answers with its record — drawn NOW, never waiting for the broadcast echo
      if (r.message) place([r.message]);
      if (r.group) { group = { ...group, ...r.group }; }
      showToast(`${t('Sent')} — ${wakeEchoText(r)}`);
    };
    preview();
  }

  let readInFlight = false;
  function markRead() {
    if (readInFlight) return;
    readInFlight = true;
    fetchJson(`/api/channel-groups/${encodeURIComponent(groupId)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .catch(() => {}).finally(() => { readInFlight = false; });
  }

  async function render() {
    list.textContent = '';
    seen.clear(); oldest = null;
    const r = await loadPage({});
    if (r.error || !group) {
      bar.textContent = '';
      bar.appendChild(el('div', 'chanwin-err', groupErrorText(r.error && r.error.code ? r.error : { code: 'not-found' })));
      foot.textContent = '';
      return;
    }
    if (!r.n) list.appendChild(el('div', 'chanwin-empty', t('No messages yet.')));
    drawBar();
    drawFoot();
    list.scrollTop = list.scrollHeight;
    markRead();   // opening the window is a USER act
  }

  list.addEventListener('scroll', () => {
    if (list.scrollTop > 4 || oldest === null) return;
    const before = list.scrollHeight;
    loadPage({ prepend: true }).then((x) => { if (x && x.n) list.scrollTop = list.scrollHeight - before; }).catch(() => {});
  });

  // THE BROADCAST CARRIES BOTH HALVES: the recomputed list (the bar repaints
  // from its entry) and the new records (appended, deduplicated by vendorId —
  // the send answer may have drawn one already). No full re-render per event.
  const onBroadcast = (msg) => {
    if (msg.type !== 'channel-groups-updated' || !group) return;
    const g = Array.isArray(msg.groups) ? msg.groups.find((x) => x.id === groupId) : null;
    const wasArchived = !!group.archivedAt;
    if (g) { group = g; drawBar(); }
    if (Array.isArray(msg.messages)) place(msg.messages.filter((m) => m && m.convId === groupId));
    if (g && !!g.archivedAt !== wasArchived) drawFoot();
  };
  app.ws.onGlobal(onBroadcast);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { app.ws.offGlobal(onBroadcast); } catch {} });
  winInfo.element?.addEventListener('pointerdown', () => { if (group && group.unread) markRead(); }, { signal: winInfo._listenerCtl?.signal });
  render().catch((e) => showToast(String(e && e.message ? e.message : e), { type: 'error' }));
  return winInfo;
}

/** Drop a day separator that repeats the one before it. */
function dedupeDaysIn(list) {
  let prev = null;
  for (const node of [...list.querySelectorAll('.chanmsg-day')]) {
    if (prev && prev.dataset.day === node.dataset.day) node.remove(); else prev = node;
  }
}

registerWindowType({
  type: 'channel', label: t('Channel'), icon: ICON,
  action: 'openChannel',
  replay: (app, spec, { syncId } = {}) => app.openChannel(spec.adapterId, spec.convId, { syncId }),
});
