// THE PROMPT-CACHE WARMTH ON THE DESKTOP (lane cache-warmth-band, q-059 r1b — the owner's ruling 2026-11-03 on the
// design of record: «按照这个实现吧»). With `desktop.cacheWarmth` on, the hub's session-list answer carries each live
// conversation's warmth facts + its own clock (routes/sessions warmthDiff); THIS module is the ONE place a tier is
// computed on the page: `noteWarmthAnswer` — called once per session-poll tick by Sidebar._poll — runs warmthOf over the
// answer's map ONCE and paints every surface from that map: the title bar's band, each tab's band, the taskbar tile
// rings, the desktop previews and the folded switcher button, the «+N» chip, the summary chip beside For-you, the open
// window lists, the phone's session rows and switcher rows. Every builder that rebuilds one of those elements re-applies
// its mark from the same map (paintTab / paintTile / paintPreviews / paintOverflowChip / paintListRow /
// paintSessionCard / paintSwitcherRow) — it computes nothing new.
// THE LAWS: off = nothing (no answer ⇒ one early return; no listener, observer or timer of warmth's own); unknown draws
// nothing; expired draws no band (said in words, shown only on the summarising rings, squares and dots); the hub's clock
// only (warmthOf: serverNow + the time since the answer); no timer, no rAF, no transition — a band STEPS once per tick;
// never _notify, setTitleMeta, the sidebar digest or LIVE_SESSION_FACTS; colour = the tier attribute through the theme's
// tokens (public/style.css), never a colour written from here; every mark node is paint-only (aria-hidden).
import { warmthOf, warmthTitle, worstOf, warmthCounts, byTimeLeft } from '../cache-warmth.js';
import { t } from './i18n.js';
import { sessionOf } from './desktop-record.js';
import { slotBeside } from './customize-mode.js';
import { windowTypeIcon } from './window-types.js';
import { showWindowList } from './taskbar.js';

/** The ring every tile / chooser row / folded button carries — constant markup, never interpolated. */
const RING = '<svg class="warmth-ring" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" pathLength="100"/></svg>';
const LIVE = new Set(['fresh', 'mid', 'late', 'critical']);
const isLive = (w) => !!w && LIVE.has(w.tier);
const isKnown = (w) => !!w && (LIVE.has(w.tier) || w.tier === 'expired');
const frac3 = (w) => Math.round(Math.max(0, Math.min(1, Number(w.frac) || 0)) * 1000) / 1000;
const minutesLeft = (w) => Math.max(1, Math.ceil((Number(w.leftMs) || 0) / 60000));
const wordsOf = (w) => (isKnown(w) ? warmthTitle(w, { t }) : '');

/** The page's ONE warmth state: the last good ON answer, the map this tick computed, the held records' keys, the pass time. */
const stateOf = (app) => app._warmth || (app._warmth = { last: null, byId: new Map(), held: new Map(), heldChains: new Map(), drawn: false, passMs: 0 });
/** true while the hub's answer carries warmth (the switch is on) — the window list's head row and bands ask it */
export const warmthDrawn = (app) => !!(app && app._warmth && app._warmth.drawn);

/** THE MARK: the tier attribute (the colour, through the CSS) + the length property + warmth's own hover words, written
 *  only when one of them changed (the key lives ON the element, so a rebuilt element always gets its first write). A
 *  title is removed only where warmth set it (`data-warmth-tip`). */
function setMark(el, tier, frac, words) {
  const key = (tier || '') + '|' + (frac == null ? '' : frac) + '|' + (words || '');
  if (el._warmthKey === key) return;
  el._warmthKey = key;
  if (tier) el.setAttribute('data-warmth-tier', tier); else el.removeAttribute('data-warmth-tier');
  if (tier && frac != null) el.style.setProperty('--warmth-frac', String(frac)); else el.style.removeProperty('--warmth-frac');
  if (words) { el.title = words; el.setAttribute('data-warmth-tip', ''); }
  else if (el.hasAttribute('data-warmth-tip')) { el.removeAttribute('title'); el.removeAttribute('data-warmth-tip'); }
}
/** a words node's tier (its colour) + text, written only when they changed */
function setWords(el, tier, words) {
  const key = (tier || '') + '|' + words;
  if (el._warmthKey === key) return;
  el._warmthKey = key;
  if (tier) el.setAttribute('data-warmth-tier', tier); else el.removeAttribute('data-warmth-tier');
  el.textContent = words;
}
function markNode(tag, cls) { const el = document.createElement(tag); el.className = cls; el.setAttribute('aria-hidden', 'true'); return el; }

/** A BUILT window's conversation: the hub's activeSessions key (the webui id) — user-todos-panel keysForWin's ladder.
 *  null = not a session window, a sub-agent's view. */
function webuiIdOfWin(app, win) {
  if (!win || (win.type !== 'chat' && win.type !== 'terminal')) return null;
  const spec = win._openSpec || {};
  if (spec.agentKind === 'subagent' || spec.sourceKind === 'subagent') return null;
  const view = app.sessions && app.sessions.get(win.id);
  const vid = view && typeof view.sessionId === 'string' ? view.sessionId : '';
  return (vid && !/^(view-|sub-)/.test(vid) ? vid : (spec.serverId || '')) || null;
}
/** A HELD window (another desktop's record, not built here): the layout restore's ladder — (1) its conversation id
 *  through the live list the page holds (the active-sessions broadcast: `id` = the webui id), else (2) the record's
 *  serverSessionId, else (3) its attach openSpec's serverId (desktop-record sessionOf). The first rung the answer's map
 *  holds wins; the rung is kept (app._warmth.held) so a suite can say which one resolved it. */
function webuiIdOfRecord(ws, byConv, byId) {
  const backend = ws.backend || (ws.openSpec && ws.openSpec.backend) || 'claude';
  const conv = ws.backendSessionId || ws.claudeSessionId || (ws.openSpec && ws.openSpec.backendSessionId);
  const live = conv ? byConv.get(backend + ':' + conv) : null;
  if (live && byId.has(live)) return { id: live, rung: 'conversation' };
  const sid = sessionOf(ws);
  if (sid && byId.has(sid)) return { id: sid, rung: ws.serverSessionId === sid ? 'serverSessionId' : 'openSpec.serverId' };
  return { id: null, rung: 'none' };
}
function heldOf(app, byId, chains) {
  const out = new Map(), dm = app.desktopManager, wins = app.wm && app.wm.windows;
  if (!dm || !dm._savedStates || !wins) return out;
  const byConv = new Map();
  for (const s of (app.sidebar && app.sidebar._webuiSessions) || []) {
    const conv = s && (s.backendSessionId || s.claudeSessionId);
    if (conv && s.id) byConv.set((s.backend || 'claude') + ':' + conv, s.id);
  }
  for (const [deskId, st] of dm._savedStates) for (const ws of (st && st.windows) || []) {
    const id = ws && (ws.winId || ws.id);
    if (!id || wins.has(id)) continue;
    // r2 (H2): a held GROUP — its host entry's chain (`tabChain.tabs`, read as layout.js _recordChainOf reads it: a guest's
    // entry names none), kept per member whatever its type, so a row / a square of it takes the group's worst
    const tabs = !ws.isTabGuest && ws.tabChain && Array.isArray(ws.tabChain.tabs) ? ws.tabChain.tabs.map(String) : null;
    if (tabs && tabs.length > 1) for (const m of tabs) if (!wins.has(m)) chains.set(m, tabs);
    if (out.has(id) || (ws.type !== 'chat' && ws.type !== 'terminal')) continue;
    const spec = ws.openSpec || {};
    if (spec.agentKind === 'subagent' || spec.sourceKind === 'subagent') continue;
    out.set(id, { ...webuiIdOfRecord(ws, byConv, byId), deskId, title: ws.title || '', type: ws.type });
  }
  return out;
}

const byIdOf = (app) => (app && app._warmth && app._warmth.byId) || new Map();
const warmthOfWin = (app, win) => { const id = webuiIdOfWin(app, win); return (id && byIdOf(app).get(id)) || null; };
/** One window's own warmth by its id: a built window's conversation, else a held record's. */
function warmthOfOne(app, id) {
  const win = app.wm && app.wm.windows.get(id);
  if (win) return warmthOfWin(app, win);
  const h = app._warmth && app._warmth.held.get(id);
  return (h && h.id && byIdOf(app).get(h.id)) || null;
}
/** A window's group by its id: a BUILT group's chain, a HELD one's record (heldOf), else the window alone — the tile, the
 *  square and an «Other desktops» row (taskbar.js) take the worst over it. */
export function tileIds(app, id) {
  const win = app.wm && app.wm.windows.get(id), chain = win && win._tabChain;
  if (chain) return chain.tabs;
  return (app._warmth && app._warmth.heldChains && app._warmth.heldChains.get(id)) || [id];
}
/** A tile's warmth: a group = the worst live tier over its tabs (the «+N» chip's hidden tiles, the squares). */
function warmthOfTile(app, id) {
  const ids = tileIds(app, id);
  return ids.length > 1 ? worstOf(ids.map((x) => warmthOfOne(app, x))) : warmthOfOne(app, id);
}

/**
 * THE ONE PASS (Sidebar._poll, once per tick). `answer` = {map, serverNow, receivedAt} from the SAME parsed answer;
 * null = a good answer without warmth (the switch is off, an older hub) ⇒ clear every mark once and forget the stored
 * answer; undefined = this tick brought no answer (the fetch failed) ⇒ re-derive from the last good ON answer at the
 * current time (a band whose time ran out turns expired), never from one a null tick forgot.
 */
export function noteWarmthAnswer(app, answer) {
  if (!app) return;
  const st = stateOf(app);
  let snap = null;
  if (answer === undefined) snap = st.last;
  else if (answer === null) st.last = null;
  else snap = st.last = answer;
  if (!snap && !st.drawn) return; // OFF: nothing computed, nothing drawn
  const t0 = performance.now();
  if (!snap) {
    st.drawn = false; st.byId = new Map(); st.held = new Map(); st.heldChains = new Map();
    clearAll(app);
  } else {
    const clock = { serverNow: snap.serverNow, receivedAt: snap.receivedAt, now: Date.now() };
    const byId = new Map();
    for (const id of Object.keys(snap.map)) byId.set(id, warmthOf(snap.map[id], clock));
    st.byId = byId; st.drawn = true;
    st.heldChains = new Map();
    st.held = heldOf(app, byId, st.heldChains);
    paintAll(app);
  }
  st.passMs = performance.now() - t0;
}

function paintAll(app) {
  const wins = app.wm && app.wm.windows;
  if (wins) for (const win of wins.values()) paintFrame(app, win);
  for (const tab of document.querySelectorAll('.window-titlebar .tab-item[data-win-id]')) paintTab(app, tab);
  for (const el of document.querySelectorAll('#taskbar-items .taskbar-item[data-win-id], .taskbar-group-chooser .overlap-switcher-item[data-win-id]')) paintTile(app, el);
  paintPreviews(app);
  const chip = document.getElementById('taskbar-overflow');
  if (chip) paintOverflowChip(app, chip);
  paintSummary(app);
  for (const band of document.querySelectorAll('.overlap-switcher .wl-band')) { const row = band.parentElement; if (row && row._warmthSrc) paintListRow(app, row, row._warmthSrc); }
  if (app.isMobile) {
    for (const card of document.querySelectorAll('.session-item-card')) paintSessionCard(app, card);
    for (const row of document.querySelectorAll('.mobile-win-row[data-win-id]')) { const win = wins && wins.get(row.dataset.winId); if (win) paintSwitcherRow(app, row, win); }
  }
}

/** OFF: every mark once — the nodes warmth built, the attributes and the titles it wrote, the summary chip; the «+N»
 *  chip back to its plain «+N» (paintOverflowChip, warmth no longer drawn). */
function clearAll(app) {
  for (const el of document.querySelectorAll('.tab-warmth, .warmth-ring, .wl-head, .wl-band, .wl-left, .sess-warmth, .sess-warmth-left, #taskbar-warmth')) el.remove();
  for (const el of document.querySelectorAll('[data-warmth-tier], [data-warmth-tip]')) { el._warmthKey = null; setMark(el, null, null, ''); }
  for (const el of document.querySelectorAll('.mobile-win-row[data-win-id]')) el.removeAttribute('data-win-id');
  for (const el of document.querySelectorAll('.overlap-switcher:not(.warmth-list) .wl-name')) el.classList.remove('wl-name'); // the ⧉ list's labels as before
  const chip = document.getElementById('taskbar-overflow');
  if (chip) paintOverflowChip(app, chip);
}

/** §2.1 the title bar's band (a pseudo-element on the bar's bottom edge, style.css) + the bar's hover words. A bar that
 *  hosts a tab strip carries neither: each tab carries its own (paintTab). */
function paintFrame(app, win) {
  const bar = win.titleBar;
  if (!bar) return;
  const w = bar.querySelector(':scope > .tab-bar-tabs') ? null : warmthOfWin(app, win);
  setMark(bar, isLive(w) ? w.tier : null, isLive(w) ? frac3(w) : null, wordsOf(w));
}

/** §2.2 a tab's own band (a child node, its FIRST — the tab's pseudo-elements are taken) + its label's hover words
 *  (`tab.title` is _markStrip's). makeTab calls it for the tab it just built. */
export function paintTab(app, tab) {
  if (!tab || !warmthDrawn(app)) return;
  const win = app.wm && app.wm.windows.get(tab.dataset.winId);
  const w = win ? warmthOfWin(app, win) : null;
  let band = tab.querySelector(':scope > .tab-warmth');
  if (isLive(w)) {
    if (!band) { band = markNode('span', 'tab-warmth'); tab.prepend(band); }
    setMark(band, w.tier, frac3(w), '');
  } else if (band) band.remove();
  const label = tab.querySelector(':scope > .tab-label');
  if (label) setMark(label, null, null, wordsOf(w));
}

/** §2.3 a taskbar tile's ring (a group tile: the worst live tier over its tabs) — also the group chooser's rows. Expired
 *  = the full ring in --warmth-expired; unknown / not a session = no ring. On a TILE it rides its icon's corner (r2 H3:
 *  it adds no width — the 90-px floor keeps its readable word); a chooser row has the room: before its icon. */
export function paintTile(app, el) {
  if (!el || !warmthDrawn(app)) return;
  const ids = el.dataset.groupTabs ? el.dataset.groupTabs.split(',') : [el.dataset.winId];
  const w = ids.length > 1 ? worstOf(ids.map((id) => warmthOfOne(app, id))) : warmthOfOne(app, ids[0]);
  const host = el.querySelector(':scope > .taskbar-icon, :scope > .taskbar-icon-stack') || el;
  let ring = host.querySelector(':scope > .warmth-ring');
  if (!isKnown(w)) { if (ring) ring.remove(); return; }
  if (!ring) { host.insertAdjacentHTML('afterbegin', RING); ring = host.firstElementChild; }
  setMark(ring, w.tier, w.tier === 'expired' ? 1 : frac3(w), '');
}

/** §2.4 the desktop previews: each square its conversation's tier (a tab group's members: the group's worst), each
 *  desktop's ring its WORST LIVE tier (none while that is fresh), the folded button's ring the worst across all desktops
 *  (drawn when fresh too, as a full ring). _renderSwitcher calls it after each full and each compact build. */
export function paintPreviews(app) {
  if (!warmthDrawn(app)) return;
  const root = document.getElementById('desktop-previews');
  if (!root) return;
  const st = app._warmth, wins = app.wm ? app.wm.windows : new Map(), active = app.desktopManager && app.desktopManager.activeDesktopId;
  const perDesk = new Map();
  const add = (desk, w) => { if (!isKnown(w)) return; const l = perDesk.get(desk); if (l) l.push(w); else perDesk.set(desk, [w]); };
  for (const win of wins.values()) if (!win._isStagePlaceholder) add(win._desktopId || active, warmthOfWin(app, win));
  for (const h of st.held.values()) if (h.id) add(h.deskId, st.byId.get(h.id));
  for (const sq of root.querySelectorAll('.desktop-preview-win[data-win-id]')) {
    const w = warmthOfTile(app, sq.dataset.winId); // a group's member (built or held): the group's worst
    setMark(sq, isKnown(w) ? w.tier : null, null, '');
  }
  for (const pv of root.querySelectorAll('.desktop-preview[data-desktop-id]')) {
    const w = worstOf(perDesk.get(pv.dataset.desktopId) || []);
    setMark(pv, w && w.tier !== 'fresh' ? w.tier : null, null, '');
  }
  const btn = root.querySelector('.desktop-switch-compact');
  if (btn) {
    const w = worstOf([].concat(...perDesk.values()));
    let ring = btn.querySelector(':scope > .warmth-ring');
    if (!w) { if (ring) ring.remove(); return; }
    if (!ring) { btn.insertAdjacentHTML('afterbegin', RING); ring = btn.firstElementChild; }
    setMark(ring, w.tier, 1, '');
  }
}

/** §2.5 the «+N» chip: a dot in the worst live tier its hidden tiles hold and words that name the dot's tier
 *  («+N · k critical» / «+N · k expired»); warmth not drawn ⇒ exactly the plain «+N». fitTaskbarStrip stores the hidden
 *  ids on the chip and clears its key before each call (it rewrote the text). r3 J1: while warmth is drawn the chip sits
 *  in a CONSTANT box (`warmth-box`, style.css — taskbar-fit.js OVERFLOW_CHIP_WARM_BOX_PX): the fit reads a constant, never
 *  the chip's content — the words get SHORTER when a live tile joins an expired tail, and a box that followed them would
 *  widen the strip, refit it and flip the words back every frame. toggle(force) writes nothing when the class stands. */
export function paintOverflowChip(app, chip) {
  if (!chip) return;
  const ids = chip._hiddenIds || [], n = ids.length, drawn = warmthDrawn(app);
  chip.classList.toggle('warmth-box', drawn);
  if (!drawn) { if (chip._warmthKey) { chip._warmthKey = ''; chip.textContent = '+' + n; } return; }
  const ws = ids.map((id) => warmthOfTile(app, id));
  const w = worstOf(ws);
  const k = w ? ws.filter((x) => x && x.tier === w.tier).length : 0;
  const words = w && w.tier === 'critical' ? t('+{n} · {k} critical', { n, k }) : w && w.tier === 'expired' ? t('+{n} · {k} expired', { n, k }) : '+' + n;
  const key = (w ? w.tier : '-') + '|' + words;
  if (chip._warmthKey === key) return;
  chip._warmthKey = key;
  chip.textContent = '';
  if (w) { const dot = markNode('span', 'wsum-dot'); dot.setAttribute('data-warmth-tier', w.tier); chip.appendChild(dot); }
  chip.appendChild(document.createTextNode(words));
}

/** Every conversation with a KNOWN warmth on every desktop — built session windows (guests included, stage placeholders
 *  not) and the held records — one row per conversation, the first window wins. The summary chip counts it and its list
 *  lists it. */
export function warmthRows(app) {
  if (!warmthDrawn(app)) return [];
  const st = app._warmth, seen = new Set(), rows = [], active = app.desktopManager && app.desktopManager.activeDesktopId;
  for (const win of app.wm ? app.wm.windows.values() : []) {
    if (win._isStagePlaceholder) continue;
    const key = webuiIdOfWin(app, win), w = key && st.byId.get(key);
    if (!isKnown(w) || seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: win.id, deskId: win._desktopId || active || null, built: true, title: win.title || '', icon: win._typeIcon || '', key });
  }
  for (const [id, h] of st.held) {
    const w = h.id && st.byId.get(h.id);
    if (!isKnown(w) || seen.has(h.id)) continue;
    seen.add(h.id);
    rows.push({ id, deskId: h.deskId, built: false, title: h.title, icon: windowTypeIcon(h.type), key: h.id });
  }
  return rows;
}
/** a list row's warmth now: by its conversation (the summary list) or its window ids (the window list: a host = worst) */
const warmthOfSrc = (app, src) => (src.key ? byIdOf(app).get(src.key) || null : src.ids.length > 1 ? worstOf(src.ids.map((id) => warmthOfOne(app, id))) : warmthOfOne(app, src.ids[0]));
/** the comparator over rows the list built (each row's `_warmthSrc`) — «By time left» */
export const byRowTimeLeft = (app) => (a, b) => byTimeLeft(warmthOfSrc(app, a._warmthSrc), warmthOfSrc(app, b._warmthSrc));

/** §2.6 the summary chip beside For-you: «Going cold a · Late b · Expired c / n» over every desktop; built while warmth
 *  is drawn and at least one conversation is known, removed otherwise; its press opens the list (taskbar.js
 *  showWindowList { all: true }). Desk only. */
function paintSummary(app) {
  let chip = document.getElementById('taskbar-warmth');
  const rows = app.isMobile ? [] : warmthRows(app);
  if (!rows.length) { if (chip) chip.remove(); return; }
  const by = byIdOf(app), c = warmthCounts(rows.map((r) => by.get(r.key)));
  if (!chip) {
    chip = document.createElement('button');
    chip.id = 'taskbar-warmth'; chip.type = 'button'; chip.className = 'warmth-summary';
    chip.title = t('Prompt-cache warmth on every desktop — click for the list by time left');
    chip.addEventListener('click', (e) => { e.stopPropagation(); showWindowList(app, chip, { all: true }); });
    seatChip(chip);
  }
  const key = [c.critical, c.late, c.expired, c.known].join('|');
  if (chip._warmthKey === key) return;
  chip._warmthKey = key;
  chip.textContent = '';
  for (const [tier, words] of [['critical', t('Going cold {n}', { n: c.critical })], ['late', t('Late {n}', { n: c.late })], ['expired', t('Expired {n}', { n: c.expired })]]) {
    if (chip.firstChild) { const sep = markNode('span', 'wsum-sep'); sep.textContent = '\u00B7'; chip.appendChild(sep); } // « · » between the counts, as drawn
    const seg = document.createElement('span'); seg.className = 'wsum-seg';
    const dot = markNode('span', 'wsum-dot'); dot.setAttribute('data-warmth-tier', tier);
    seg.append(dot, document.createTextNode(words));
    chip.appendChild(seg);
  }
  const total = document.createElement('span'); total.className = 'wsum-total'; total.textContent = '/ ' + c.known;
  chip.appendChild(total);
}
function seatChip(chip) {
  const slot = slotBeside('taskbar-user-todos', document.getElementById('taskbar-tray'));
  if (slot && (chip.parentNode !== slot.parent || chip.nextSibling !== slot.before)) slot.parent.insertBefore(chip, slot.before);
}
/** Re-seat the summary chip beside For-you — app.js calls it after the chrome applied an arrangement (beside
 *  placeVaultChip). Nothing while there is no chip. */
export const placeWarmthChip = () => { const chip = document.getElementById('taskbar-warmth'); if (chip) seatChip(chip); };

/** §2.6/§2.7 a list row's band (a 60 px track before the label) and its time in words (at the row's end). `src` =
 *  { ids } (the window list: a host row = its tabs) or { key } (the summary list: the conversation). The tick patches
 *  every open row in place; a row whose conversation lost its warmth keeps its place, band and words cleared. */
export function paintListRow(app, item, src, label) {
  if (!item || !warmthDrawn(app)) return;
  item._warmthSrc = src;
  if (label) label.classList.add('wl-name'); // r2 (H1): the label shrinks with an ellipsis — the band and the words stay whole
  const w = warmthOfSrc(app, src);
  let band = item.querySelector(':scope > .wl-band'), left = item.querySelector(':scope > .wl-left');
  if (!band) { band = markNode('span', 'wl-band'); item.insertBefore(band, label && label.parentNode === item ? label : null); }
  if (!left) { left = document.createElement('span'); left.className = 'wl-left'; item.appendChild(left); }
  setMark(band, isLive(w) ? w.tier : null, isLive(w) ? frac3(w) : null, '');
  setWords(left, isLive(w) ? w.tier : null, isLive(w) ? t('{n} min left', { n: minutesLeft(w) }) : isKnown(w) ? t('Expired') : '');
}

/** §2.8 a phone session row: the band on its bottom edge (its FIRST child) + «N min left» / «Expired» at the end of its
 *  main line. _buildSessionCard calls it for the card it built; phone classes only. */
export function paintSessionCard(app, card) {
  if (!card || !app || !app.isMobile || !warmthDrawn(app)) return;
  const w = card._webuiId ? byIdOf(app).get(card._webuiId) || null : null;
  paintRowPair(card, card.querySelector('.session-card-main'), w);
}
/** §2.8 a phone window-switcher row (one per tab): the same pair. _buildWindowItem calls it for the row it built. */
export function paintSwitcherRow(app, item, win) {
  if (!item || !win || !warmthDrawn(app)) return;
  item.dataset.winId = win.id;
  item.style.position = 'relative';
  const own = [...item.children].filter((c) => !c.classList.contains('sess-warmth') && !c.classList.contains('sess-warmth-left'));
  paintRowPair(item, item, warmthOfWin(app, win), own[1] || null); // the words right after the label (icon, label, …)
}
function paintRowPair(row, wordsHost, w, after) {
  let band = row.querySelector(':scope > .sess-warmth'), left = row.querySelector('.sess-warmth-left');
  if (isLive(w)) { if (!band) { band = markNode('span', 'sess-warmth'); row.prepend(band); } setMark(band, w.tier, frac3(w), ''); }
  else if (band) band.remove();
  if (!isKnown(w) || !wordsHost) { if (left) left.remove(); return; }
  if (!left) {
    left = document.createElement('span'); left.className = 'sess-warmth-left';
    if (after && after.parentNode === wordsHost) after.after(left); else wordsHost.appendChild(left);
  }
  setWords(left, isLive(w) ? w.tier : null, isLive(w) ? t('{n} min left', { n: minutesLeft(w) }) : t('Expired'));
}
