// THE CHANNELS PANEL (docs/design-communication-panel.zh.md §10).
//
// The sidebar rail's `channels` panel: adapters, their conversations, and on
// EVERY ROW A FRESHNESS CHIP. That chip is not decoration — it is this
// feature's honesty contract. A row says how long ago its evidence was
// gathered ("live" / "within 30s" / "scanned 4m ago"), because that is the one
// number a user needs before handing something to a lane. The CLAIM comes
// from the server's `freshnessClaim`, which resolves from the lane ACTUALLY
// carrying the row (`laneState` / `scanState`) — never from the adapter's
// static declaration, so a demoted or dead push lane draws the poll cadence it
// is really on (the `opencode-events` round-4 lesson: a lane that lies about
// being active is worse than no lane, because it turns the fallback off) — and
// the SENTENCE is composed here, in the language of the device reading it.
//
// XSS LAW: every string here is vendor- or peer-controlled and syncs to every
// client, so EVERYTHING renders through textContent. No innerHTML on any path.
//
// THE MENU AND THE GEAR ROW ARE CONTRIBUTIONS (src/lib/contributions.js), the
// same shape core's session-card / window / gear menus use — registered by the
// module that OWNS the feature, so gear-menu.js stays byte-identical to its
// pinned legacy row list.
import { fetchJson, showContextMenu, showToast } from './utils.js';
import { t } from './i18n.js';
import { registerMenuItem, menuItems } from './contributions.js';
// PURE, bundled directly (the task-color-seq / quota-model pattern). THE
// SENTENCE IS COMPOSED HERE (r2): `freshnessClaim` used to build it server
// side with no translator, so the chip this feature calls its honesty
// contract shipped ENGLISH-ONLY to a zh/ja UI — and the server cannot fix
// that, because the digest is broadcast to every client at once while the
// language is per DEVICE (localStorage).
import * as chanCaps from '../channel-caps.js';

const CHIP_CLASS = { live: 'chan-chip-live', within: 'chan-chip-within', scanned: 'chan-chip-scan' };

/** A short, honest freshness chip. The server sends `{kind, state, seconds}`
 *  and `freshnessText` turns it into words: a claim whose `state` we do not
 *  recognise says `unknown` rather than inventing a number. */
function chip(freshness) {
  const el = document.createElement('span');
  el.className = 'chan-chip ' + (CHIP_CLASS[freshness && freshness.kind] || 'chan-chip-within');
  el.textContent = chanCaps.freshnessText(freshness, { t }) || t('unknown');
  el.title = t('How fresh this row is — the lane actually carrying it, not the one the adapter declares.');
  return el;
}

function laneNote(lane) {
  if (!lane) return '';
  if (lane.via === 'scan') return lane.source ? `${t('scan')} · ${lane.source}` : `${t('scan')} · ${lane.why || t('no source')}`;
  if (lane.via === 'push') return t('push');
  return t('poll');
}

async function api(pathname, init) {
  const r = await fetchJson(pathname, init);
  if (r && r.error) { showToast(r.error, { type: 'error' }); return null; }
  return r;
}

function rowMenuCtx(app, conv) { return { app, conv }; }

/** The `channel-row` menu. P0a contributes only the verbs that DO something;
 *  assign / filter / reach belong to later phases and a menu row that opens
 *  nothing is the declared-but-inert slot this design argues against. */
export function registerChannelsMenus() {
  const M = 'channel-row';
  registerMenuItem({
    menu: M, group: '1_open', order: 10,
    label: () => t('Open'),
    run: (c) => c.app.openChannel(c.conv.adapterId, c.conv.id),
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 0, separator: true,
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 10,
    when: (c) => !c.conv.tracked,
    label: () => t('Track this conversation'),
    run: (c) => api(`/api/channels/${encodeURIComponent(c.conv.adapterId)}/${encodeURIComponent(c.conv.id)}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracked: true }) }),
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 20,
    when: (c) => !!c.conv.tracked,
    label: () => t('Stop tracking'),
    run: (c) => api(`/api/channels/${encodeURIComponent(c.conv.adapterId)}/${encodeURIComponent(c.conv.id)}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tracked: false }) }),
  });
  registerMenuItem({
    menu: M, group: '2_state', order: 30,
    when: (c) => !!c.conv.tracked && c.conv.unread > 0,
    label: () => t('Mark read'),
    run: (c) => api(`/api/channels/${encodeURIComponent(c.conv.adapterId)}/${encodeURIComponent(c.conv.id)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  });
}

/** The ⚙ gear row — registered HERE, by the module that owns the feature, so
 *  gear-menu.js's own registration block stays byte-identical to the pinned
 *  legacy list it is diffed against. `when` hides it where the rail (its only
 *  surface in P0a) does not exist, rather than offering a row that lands
 *  nowhere. */
export function registerChannelsGearRow() {
  registerMenuItem({
    menu: 'gear', group: '1_admin', order: 45,
    icon: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
    when: (c) => !!(c.app && c.app.sidebar && c.app.sidebar._railEl),
    label: () => t('Channels…'),
    run: (c) => c.app.openChannels(),
  });
}

/**
 * Render the rail panel into `c`. Renders ONCE per tab entry (the rail's
 * renders-once guard) and re-renders on the engine's `channels-updated`
 * broadcast, which carries the recomputed digest — so a repaint costs no
 * fetch (the cache-invalidation law: one dirty signal, one computation).
 */
export function renderChannelsPanel(app, c) {
  const head = document.createElement('div');
  head.className = 'chan-head';
  const summary = document.createElement('div');
  summary.className = 'chan-summary';
  head.appendChild(summary);
  const root = document.createElement('div');
  root.className = 'chan-list';
  c.append(head, root);

  function draw(d) {
    root.textContent = '';
    const adapters = (d && d.adapters) || [];
    const convs = (d && d.conversations) || [];
    const tracked = convs.filter((x) => x.tracked).length;
    summary.textContent = adapters.length
      ? t('{a} adapters · {n} conversations · {k} tracked', { a: adapters.length, n: convs.length, k: tracked })
      : t('No channel adapters are connected.');
    if (!adapters.length) {
      const e = document.createElement('div');
      e.className = 'chan-empty';
      e.textContent = t('Connecting Lark and Gmail arrives in the next phase. Nothing is fetched until you connect and track a conversation.');
      root.appendChild(e);
      return;
    }
    for (const a of adapters) {
      const sec = document.createElement('div');
      sec.className = 'chan-sec';
      const h = document.createElement('div');
      h.className = 'chan-sec-head';
      const nm = document.createElement('b');
      nm.textContent = a.label || a.id;
      const st = document.createElement('span');
      st.className = 'chan-sec-state' + (a.consecutiveFailures >= 3 ? ' chan-warn' : '');
      // A disabled adapter SAYS so on its section (r3): its rows' chips say
      // "not polling" and this is the reason beside them.
      st.textContent = a.enabled === false ? t('disabled')
        : a.consecutiveFailures >= 3
          ? t('{n} failed passes ({code})', { n: a.consecutiveFailures, code: (a.lastPass && a.lastPass.code) || '?' })
          : laneNote(a.lane);
      h.append(nm, st);
      sec.appendChild(h);
      const mine = convs.filter((x) => x.adapterId === a.id);
      if (!mine.length) {
        const e = document.createElement('div');
        e.className = 'chan-empty';
        e.textContent = t('No conversations discovered yet.');
        sec.appendChild(e);
      }
      for (const conv of mine) sec.appendChild(row(conv));
      root.appendChild(sec);
    }
  }

  function row(conv) {
    const el = document.createElement('div');
    el.className = 'chan-row' + (conv.tracked ? ' chan-tracked' : '');
    el.dataset.conv = `${conv.adapterId}/${conv.id}`;
    const line = document.createElement('div');
    line.className = 'chan-row-line';
    const title = document.createElement('span');
    title.className = 'chan-row-title';
    title.textContent = conv.title || conv.id;
    line.appendChild(title);
    if (conv.tracked && conv.unread) {
      const b = document.createElement('span');
      b.className = 'chan-unread';
      b.textContent = String(conv.unread);
      line.appendChild(b);
    }
    line.appendChild(chip(conv.freshness));
    if (!conv.tracked) {
      const u = document.createElement('span');
      u.className = 'chan-untracked';
      u.textContent = t('not tracked');
      u.title = t('Nothing is fetched for this conversation until you track it.');
      line.appendChild(u);
    }
    el.appendChild(line);
    const sub = document.createElement('div');
    sub.className = 'chan-row-sub';
    sub.textContent = conv.participants || '';
    el.appendChild(sub);
    el.onclick = () => app.openChannel(conv.adapterId, conv.id);
    el.oncontextmenu = (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, menuItems('channel-row', rowMenuCtx(app, conv)));
    };
    return el;
  }

  async function refresh() {
    const d = await fetchJson('/api/channels');
    if (!c.isConnected) return;
    if (d && d.error) { root.textContent = ''; const e = document.createElement('div'); e.className = 'chan-empty'; e.textContent = d.error; root.appendChild(e); return; }
    draw(d);
  }

  // THE HANDLER IS HELD IN A NAMED CONST AND REMOVED BY NAME (r2) — see the
  // same note in channel-window.js, including the measurement: the
  // load-bearing half is `onGlobal` returning its own unsubscribe, and this
  // form is the belt. `off?.()` on the result of `onGlobal` was a no-op while
  // that method returned undefined, so every rail repaint left another live
  // handler behind.
  const onBroadcast = (msg) => {
    if (msg.type !== 'channels-updated' || !c.isConnected) return;
    if (msg.digest) draw(msg.digest); else refresh().catch(() => {});
  };
  app.ws.onGlobal(onBroadcast);
  refresh().catch(() => {});
  return () => { try { app.ws.offGlobal(onBroadcast); } catch {} };
}

/** Focus the rail's Channels panel (the ⚙ row and any deep link). */
export function focusChannelsPanel(app) {
  const sb = app.sidebar;
  if (!sb || !sb._railEl || !sb.listEl) return false;
  if (sb._activeTab !== 'channels') sb._railGo('channels');
  else {
    if (!sb.isOpen) sb.toggle(true);
    sb.listEl.querySelector('.rail-panel-channels')?.remove();
    sb._renderRailPanel();
  }
  return true;
}

registerChannelsMenus();
registerChannelsGearRow();
