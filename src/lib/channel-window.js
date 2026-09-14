// THE CHANNEL CONVERSATION WINDOW (docs/design-communication-panel.zh.md
// §10.1, §10.3). A registered WINDOW TYPE, so layout restore, cross-client
// sync, virtual desktops, tab groups and the taskbar all work for free and
// `replayOpenSpec` cannot silently drop it (the registry has a loud default).
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
//    context bar beside the conversation it is about.
//
// P0a NOTE, said out loud rather than implied: the composer that appears on a
// SENDABLE conversation is inert, and it says so. Sending is the outbox's
// phase (propose → policy → approve → send → receipt) and shipping a button
// that silently does nothing would be exactly the declared-but-inert slot this
// design argues against.
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
// PURE, bundled directly (the task-color-seq / quota-model pattern): the
// server sends STRUCTURE and the sentence is composed HERE, because the
// digest is broadcast to every client while the language is per DEVICE.
import * as chanCaps from '../channel-caps.js';

const ICON = svgIcon16('<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>');

const PAGE = 50;

const stamp = (ms) => {
  const d = new Date(Number(ms) || 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** ONE row. EVERYTHING is textContent — see rule 1. */
function renderRecord(rec) {
  const el = document.createElement('div');
  el.className = 'chanmsg';
  el.dataset.at = String(rec.at || 0);
  const head = document.createElement('div');
  head.className = 'chanmsg-head';
  const who = document.createElement('b');
  who.textContent = (rec.author && rec.author.name) || (rec.author && rec.author.id) || t('unknown');
  const when = document.createElement('span');
  when.className = 'chanmsg-at';
  when.textContent = stamp(rec.at);
  head.append(who, when);
  if (rec.raw && rec.raw.synthetic) {
    // A scraped source mints its own key. Saying so on the row is the same
    // honesty the freshness chip owes: the reader should know which evidence
    // this line came from.
    const s = document.createElement('span');
    s.className = 'chanmsg-syn';
    s.textContent = t('scanned');
    s.title = t('This message has no vendor id — the adapter minted a stable key from its content.');
    head.appendChild(s);
  }
  const body = document.createElement('div');
  body.className = 'chanmsg-body';
  body.textContent = rec.text || '';
  el.append(head, body);
  return el;
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

  const root = document.createElement('div');
  root.className = 'chanwin';
  winInfo.content.appendChild(root);

  const bar = document.createElement('div');
  bar.className = 'chanwin-bar';
  const list = document.createElement('div');
  list.className = 'chanwin-list';
  const foot = document.createElement('div');
  foot.className = 'chanwin-foot';
  root.append(bar, list, foot);

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
      const e = document.createElement('div');
      e.className = 'chanwin-err';
      e.textContent = (r && r.error) || t('This conversation is not available.');
      bar.appendChild(e);
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
    const title = document.createElement('b');
    title.textContent = c.title || convId;
    const meta = document.createElement('span');
    meta.className = 'chanwin-meta';
    const bits = [c.adapterId];
    if (c.participants) bits.push(c.participants);
    const fresh = chanCaps.freshnessText(c.freshness, { t });
    if (fresh) bits.push(fresh);
    meta.textContent = bits.join(' · ');
    bar.append(title, meta);

    // The send half: offered, or NOT offered WITH its reason (never silence).
    const send = c.offers && (c.offers.sendAsUser.offered ? c.offers.sendAsUser : (c.offers.sendAsBot.offered ? c.offers.sendAsBot : null));
    if (send) {
      const comp = document.createElement('div');
      comp.className = 'chanwin-composer';
      comp.dataset.channelSend = '1';
      const ta = document.createElement('textarea');
      ta.placeholder = t('Replies arrive with the approval outbox — this composer is not connected yet.');
      ta.disabled = true;
      const note = document.createElement('div');
      note.className = 'chanwin-note';
      note.textContent = t('Sending is not available yet: every outgoing message goes through the approval outbox, which is a later phase.');
      comp.append(ta, note);
      foot.textContent = '';
      foot.appendChild(comp);
      const warn = c.identityWarning;
      const warnText = chanCaps.identityWarningText(warn, { t });
      if (warnText) {
        const w = document.createElement('div');
        w.className = 'chanwin-warn';
        w.textContent = warnText;
        foot.appendChild(w);
      }
    } else {
      // NO composer element at all — the P0 exit condition.
      foot.textContent = '';
      const ro = document.createElement('div');
      ro.className = 'chanwin-readonly';
      const why = (c.offers && c.offers.sendAsUser.why) || 'unknown';
      ro.textContent = t('Read-only here ({why})', { why });
      foot.appendChild(ro);
    }
    return c;
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
    for (const rec of recs) frag.appendChild(renderRecord(rec));
    if (prepend) list.insertBefore(frag, list.firstChild); else list.appendChild(frag);
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

  async function render({ read = false } = {}) {
    const c = await renderBar();
    if (!c) return;
    list.textContent = '';
    oldest = null; oldestId = null;
    const n = await loadPage({});
    if (!n) {
      const e = document.createElement('div');
      e.className = 'chanwin-empty';
      e.textContent = c.tracked ? t('No messages yet.') : t('Not tracked — nothing is fetched for this conversation until you track it.');
      list.appendChild(e);
    }
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

registerWindowType({
  type: 'channel', label: 'Channel', icon: ICON,
  action: 'openChannel',
  replay: (app, spec, { syncId } = {}) => app.openChannel(spec.adapterId, spec.convId, { syncId }),
});
