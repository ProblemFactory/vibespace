// SHARING A DESKTOP-APP WINDOW WITH AGENTS — the client half of desktop lane E (docs/design-desktop-apps-seamless
// §3.6, 2026-09-25; the owner's D1–D7, model = src/window-reach.js, decided by the window-targets engine). Every
// window is HIDDEN from every agent until the user shares it (D1). Three surfaces, ONE picker:
//   · the launcher's "Share with agents" row (D2 "before launch") — `mountLaunchShareRow`: a summary button that
//     opens a popover with the picker; what the user sets rides the launch as `share` and is REMEMBERED per app
//     (user state `desktopAppReach[<app key>]`, the key desktopAppFrame uses — PATCH merge-only, synced by the
//     user-state-updated broadcast); untouched, a launch proposes what that app remembers;
//   · the window's "Share with agent…" dialog (D2 "after launch") — `openShareDialog`: every live agent session and
//     Task Group as a checkbox (checking grants, unchecking revokes at once — a holder that loses its reach loses its
//     lease), the rows another origin wrote named (you asked it / it opened the window itself), and the MODE (D7):
//     Auto / Accessibility tree / Pixels, "takes effect at the agent's next action";
//   · "Ask an agent to take control…" (D3) — `openAskDialog`: one live agent, an optional line, "Wake it now (starts
//     a billed turn)" OFF by default (off = its next turn, free); another agent's hold ends when the user says so.
// Every name (a session's, a group's) is peer-controlled text: it reaches the page through textContent only. Every
// failure is a toast (fetchJson never throws; routes answer {error, code}). Nothing waits for a broadcast echo.
import { t } from './i18n.js';
import { createModalShell, createPopover, fetchJson, showToast } from './utils.js';
import { groupTitle } from './channel-words.js';
import { frameKeyOf } from './desktop-seamless.js';
import { pickerModel, shareSummary, MODES, proposalOf, setProposal, launchShare, launchSummary, rememberedCount } from '../window-reach.js';
// the ONE principal picker (channel-polish, 2026-09-27): search + list + chips, keyed rows patched in place
import { principalPicker } from './principal-picker.js';
import { folderTail } from './principal-picker-model.js';

export const REACH_KEY = 'desktopAppReach';
const JSON_HDR = { 'Content-Type': 'application/json' };

/** The mode's name in the UI (the owner's words: 无障碍树 / 像素). */
export function modeLabel(mode) {
  if (mode === 'tree') return t('Accessibility tree');
  if (mode === 'pixels') return t('Pixels');
  return t('Auto');
}
/** What a mode means, in one plain sentence. */
export function modeHint(mode) {
  if (mode === 'tree') return t('The agent reads the window\'s accessibility tree and acts on its buttons and fields; screenshots and clicks stay its fallback.');
  if (mode === 'pixels') return t('Closest to you operating it by hand: the agent looks at screenshots and clicks, types, presses keys and scrolls at points.');
  return t('Accessibility tree when the app exposes one, otherwise pixels.');
}
/** The window's chip — "Shared with 2 · Pixels" ('' when nobody); with ALL AGENTS it names it first — "Shared with:
 *  All agents (2 more rows) · Pixels" (lane everyone-principal). `view` = a reach view (GET …/reach / the broadcast). */
export function shareChipText(view) {
  if (!view || !Array.isArray(view.rows) || !view.rows.length) return '';
  const s = view.summary || shareSummary(view, view.resolved);
  const all = view.rows.some((r) => r && r.principal && r.principal.kind === 'everyone');
  if (all) {
    const more = view.rows.length - 1;
    return t('{who} · {mode}', { who: more ? t('Shared with: All agents ({n} more rows)', { n: more }) : t('Shared with: All agents'), mode: modeLabel(s.shown || s.mode) });
  }
  return t('Shared with {n} · {mode}', { n: view.rows.length, mode: modeLabel(s.shown || s.mode) });
}
/** Who wrote a row, in words. */
export function originWord(by) {
  if (by === 'request') return t('you asked it to take control');
  if (by === 'self-open') return t('it opened this window');
  return t('you shared it');
}
/** The roster the picker draws from — the sidebar's live list + its task store (the channel reach editor's roster). */
export function rosterOf(app) {
  return { sessions: (app && app.sidebar && app.sidebar._webuiSessions) || [], groups: ((app && app.sidebar && app.sidebar._tasks) || []).map((g) => ({ ...g, title: groupTitle(g) })) };
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

/** The picker's rows from the PURE model: a session (key `session:<durable key>`), a Task Group (`group:<id>`),
 *  and every shared principal no longer in the roster (said on its row). `roster` / `app` only DECORATE a
 *  session row (its folder, backend, Task Group) — who is checked is the model's. */
function pickerItemsOf(model, { roster = null, app = null } = {}) {
  const live = new Map(((roster && roster.sessions) || []).map((s) => [s.id, s]));
  const sb = app && app.sidebar;
  const out = [];
  // ALL AGENTS first (lane everyone-principal): every agent session, now and later — the owner's explicit share
  const all = model.everyone || { checked: false, by: null };
  out.push({ key: 'everyone:*', kind: 'everyone', id: '*', name: t('All agents'), checked: !!all.checked, hint: t('every conversation, now and later'), groupIds: [], groupNames: [], ref: { kind: 'everyone', row: { id: '*', name: null } } });
  for (const g of model.groups) out.push({ key: `group:${g.id}`, kind: 'group', id: g.id, name: g.name, checked: g.checked, hint: g.checked ? t('every session in it, now or later') : '', groupIds: [], groupNames: [], ref: { kind: 'group', row: g } });
  for (const s of model.sessions) {
    const w = live.get(s.id) || {};
    let tgs = [];
    try { tgs = sb && typeof sb._getSessionTaskGroups === 'function' && w.id ? sb._getSessionTaskGroups(w) || [] : []; } catch { tgs = []; }
    out.push({ key: `session:${s.key}`, kind: 'agent', id: s.key, name: s.name, folder: folderTail(w.cwd), backend: w.backend || 'claude', live: true, checked: s.checked, hint: s.checked && s.by && s.by !== 'user' ? originWord(s.by) : '', groupIds: tgs.map((g) => g.id), groupNames: tgs.map((g) => groupTitle(g)), ref: { kind: 'session', row: s } });
  }
  for (const o of model.others) {
    const k = o.principal.kind === 'group' ? 'group' : 'session';
    const row = k === 'session' ? { id: o.principal.id, key: o.principal.id, name: o.principal.name } : { id: o.principal.id, name: o.principal.name };
    out.push({ key: `${k}:${o.principal.id}`, kind: k === 'group' ? 'group' : 'agent', id: o.principal.id, name: o.principal.name || o.principal.id, checked: true, hint: k === 'session' ? t('not running now') : t('not in the list now'), groupIds: [], groupNames: [], ref: { kind: k, row } });
  }
  return out;
}

/**
 * THE PICKER — ONE renderer for the three surfaces. `model` = PURE pickerModel's answer. `onToggle(kind, row, on)`,
 * `onMode(mode)`; `busy` greys everything while a write is in flight. The agents and Task Groups are the ONE
 * principal picker (chips = who is shared with; a pick shares, a chip's ✕ stops sharing), kept on the
 * container and PATCHED on every call — a repaint never re-creates the box the person is typing in.
 */
export function renderPicker(container, { model, onToggle, onMode, busy = false, showMode = true, roster = null, app = null } = {}) {
  container.classList.add('wshare-picker');
  let st = container.__wshare;
  const items = pickerItemsOf(model, { roster, app });
  if (!st) {
    container.textContent = '';
    st = { items, sel: [], onToggle: null };
    st.picker = principalPicker({
      items: () => st.items, multi: true, everyone: 'roster',   // the rows carry ALL AGENTS (checked from the record)
      placeholder: t('Search agents and Task Groups…'), label: t('Share with agents'),
      emptyText: t('No agent session is running'),
      onChange: (keys) => {
        const before = new Set(st.sel), after = new Set(keys);
        st.sel = keys.slice();
        const byKey = new Map(st.items.map((r) => [r.key, r]));
        for (const k of after) if (!before.has(k) && byKey.get(k)) st.onToggle?.(byKey.get(k).ref.kind, byKey.get(k).ref.row, true);
        for (const k of before) if (!after.has(k) && byKey.get(k)) st.onToggle?.(byKey.get(k).ref.kind, byKey.get(k).ref.row, false);
      },
    });
    st.picker.el.classList.add('wshare-pick');
    container.appendChild(el('div', 'wshare-sec', t('Agents and Task Groups')));
    container.appendChild(st.picker.el);
    st.modeHost = el('div', 'wshare-mode-host');
    container.appendChild(st.modeHost);
    container.__wshare = st;
  }
  st.items = items;
  st.onToggle = onToggle;
  st.sel = items.filter((r) => r.checked).map((r) => r.key);
  st.picker.setSelected(st.sel);
  st.picker.refresh();
  st.picker.setBusy(busy);
  const root = container;
  const modeHost = st.modeHost;
  modeHost.textContent = '';
  container = modeHost;
  if (!showMode) return root;
  container.appendChild(el('div', 'wshare-sec', t('How the agent sees it')));
  const seg = el('div', 'wshare-mode');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', t('How the agent sees it'));
  for (const m of MODES) {
    const b = el('button', 'wshare-mode-btn', modeLabel(m));
    b.type = 'button'; b.dataset.mode = m; b.disabled = busy;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', model.mode === m ? 'true' : 'false');
    b.classList.toggle('active', model.mode === m);
    b.onclick = () => { if (model.mode !== m) onMode?.(m); };
    seg.appendChild(b);
  }
  container.appendChild(seg);
  container.appendChild(el('div', 'wshare-mode-hint', modeHint(model.mode)));
  return root;
}

// ── the per-app launch memory (user state `desktopAppReach`) — loaded once per page, kept in step by the broadcast ──
let REACH_MAP = null;
let mapWired = false;
let mapLoaded = null; // the first load's promise (B-04da ⑥: a launch outside the launcher waits for it, bounded)
// lane E verify (2026-09-25): whatever SAYS what a launch shares (the row, the cards) repaints when the memory arrives
// or changes — the words must name what the click does at every instant, including the first paint before the load
const mapListeners = new Set();
function notifyMap() { for (const fn of [...mapListeners]) { try { fn(); } catch (e) { console.warn('[window-share] repaint failed', e); } } }
function wireMap(app) {
  if (mapWired) return;
  mapWired = true;
  app.ws.onGlobal((m) => {
    if (m.type !== 'user-state-updated' || !m.state || typeof m.state !== 'object' || !(REACH_KEY in m.state)) return;
    REACH_MAP = m.state[REACH_KEY] && typeof m.state[REACH_KEY] === 'object' ? { ...m.state[REACH_KEY] } : {};
    notifyMap();
  });
  mapLoaded = fetchJson('/api/user-state').then((st) => { if (REACH_MAP === null) { REACH_MAP = st && st[REACH_KEY] && typeof st[REACH_KEY] === 'object' ? { ...st[REACH_KEY] } : {}; notifyMap(); } });
}
/** The key a launch's choice is remembered under (the desktopAppFrame key): the registry id, else `exec:<basename>`. */
export const launchKeyOf = (payload) => frameKeyOf(payload && payload.appId ? { appId: payload.appId } : { exec: payload && payload.exec });

/** B-04da ⑥ — the share a launch made OUTSIDE the launcher carries (the direct "Open with LibreOffice" door): what that
 *  app REMEMBERS, exactly as the launcher's untouched row applies it (`launchShare` — the same function), this machine
 *  only (the caller passes a local launch); the memory's first load is awaited ≤ 3 s. → share | null (hidden, auto). */
export async function rememberedShareFor(app, key) {
  wireMap(app);
  if (REACH_MAP === null && mapLoaded) await Promise.race([mapLoaded.catch(() => { }), new Promise((r) => setTimeout(r, 3000))]);
  const s = launchShare({ touched: false, choice: null, map: REACH_MAP || {}, key });
  return s.principals.length || s.mode !== 'auto' ? s : null;
}
/** …and after such a launch: the launcher's own toast (the remembered share applied, where to change it). */
export function announceRememberedShare(app, share, r) {
  if (!share || !r || !r.reach) return;
  const text = launchedToastText(launchSummary({ touched: false, proposal: share, roster: rosterOf(app) }));
  if (text) showToast(text, { duration: 7000 });
}

/** One principal in words — lane E verify r2 (M2): a principal `launchSummary` read against the roster says when it is
 *  gone, in the picker's own words ("alpha (not running now)", "Ops (not in the list now)"); a listed one carries its
 *  CURRENT name (principalsNow). */
function nameOf(p) {
  if (p.kind === 'everyone') return t('All agents');
  const name = p.name || p.id;
  if (p.absent === 'session') return t('{name} ({state})', { name, state: t('not running now') });
  if (p.absent === 'group') return t('{name} ({state})', { name, state: t('not in the list now') });
  return name;
}
/** Who a share names, in a few words ("alpha, Ops…"). */
function namesOf(principals0) {
  // ALL AGENTS first (lane everyone-principal)
  const principals = [...principals0.filter((p) => p && p.kind === 'everyone'), ...principals0.filter((p) => !(p && p.kind === 'everyone'))];
  return principals.map(nameOf).slice(0, 3).join(', ') + (principals.length > 3 ? '…' : '');
}
/**
 * What a launch will share, in words — PURE over `launchSummary` (src/window-reach.js), which is derived from the very
 * `launchShare` the click uses, so the words and the act cannot disagree (lane E verify, the verifier's major).
 * '' = nothing to say (hidden, nothing remembered).
 */
export function launchShareText(sum) {
  if (!sum || sum.kind === 'hidden') return '';
  if (sum.hidden) return sum.mode === 'auto' ? t('Hidden from agents') : t('Hidden from agents · {mode}', { mode: modeLabel(sum.mode) });
  return t('Shared with {names} · {mode}', { names: namesOf(sum.principals), mode: modeLabel(sum.mode) });
}
/** The toast after a launch that applied a REMEMBERED share (the row untouched) — '' when nothing was shared. */
export function launchedToastText(sum) {
  if (!sum || sum.kind === 'hidden') return '';
  if (sum.hidden) return t('Started in {mode} mode, still hidden from agents — change it from the window\'s ⋯', { mode: modeLabel(sum.mode) });
  return t('Started shared with {names} · {mode} — change it from the window\'s ⋯', { names: namesOf(sum.principals), mode: modeLabel(sum.mode) });
}
/** The untouched row's words: hidden, or — when any app remembers a share — that each app launches as remembered. */
export function launchRowText({ touched = false, choice = null, map = null, roster = null } = {}) {
  if (touched && choice) return launchShareText(launchSummary({ touched, choice, roster })) || t('Hidden from agents');
  return rememberedCount(map) ? t('Each app launches as you last shared it') : t('Hidden from agents (each app remembers its last choice)');
}

/**
 * THE LAUNCHER'S ROW (D2 "before launch"). `rowEl` is an empty container the dialog placed under its machine picker;
 * `isLocal()` says whether the chosen machine is this one (a paired machine's window is no agent target — the row
 * hides). Returns `{ shareFor(key), remember(key, share), announce(key, share, r), decorateCards(containers), render() }`.
 * Untouched, a launch applies what that app REMEMBERS — so the row never says "hidden" while any app remembers a share,
 * each catalog card that will launch shared carries a chip naming it, and a launch that applied a remembered share
 * says so in a toast (lane E verify, 2026-09-25).
 */
export function mountLaunchShareRow(app, rowEl, { isLocal = () => true } = {}) {
  wireMap(app);
  let touched = false;
  let choice = { principals: [], mode: 'auto' };
  let cardHosts = [];
  rowEl.classList.add('desktop-launch-share');
  const label = el('span', 'desktop-launch-share-label', t('Share with agents'));
  const btn = el('button', 'file-tool-btn desktop-launch-share-btn');
  btn.type = 'button';
  rowEl.append(label, btn);
  /** The catalog cards: each one that will launch shared names it (a chip under its label) — only while the row is
   *  untouched (touched, the row names the one choice every card launches with). */
  const paintCards = () => {
    for (const host of cardHosts) {
      if (!host || !host.isConnected) continue;
      for (const card of host.querySelectorAll('.desktop-launch-card[data-app-id]')) {
        card.querySelector('.desktop-launch-card-share')?.remove();
        if (touched || !isLocal()) continue;
        const text = launchShareText(launchSummary({ touched: false, proposal: proposalOf(REACH_MAP || {}, launchKeyOf({ appId: card.dataset.appId })), roster: rosterOf(app) }));
        if (!text) continue;
        const chip = el('span', 'desktop-launch-card-share', text); // names are peer-controlled text: textContent only
        chip.title = `${text} — ${t('This app remembers its last share and launches with it — change it with “Share with agents” above')}`;
        card.appendChild(chip);
      }
    }
  };
  const render = () => {
    const show = isLocal();
    rowEl.style.display = show ? '' : 'none';
    btn.textContent = launchRowText({ touched, choice, map: REACH_MAP || {}, roster: rosterOf(app) });
    btn.title = t('Every window is hidden from agents until you share it');
    paintCards();
  };
  const onMap = () => { if (!rowEl.isConnected) { mapListeners.delete(onMap); return; } render(); };
  mapListeners.add(onMap);
  btn.onclick = (e) => {
    e.stopPropagation();
    const pop = createPopover(btn, 'wshare-popover');
    const draw = () => {
      const roster = rosterOf(app);
      const model = pickerModel({ ...roster, record: { mode: choice.mode, rows: [] }, principals: choice.principals });
      renderPicker(pop, {
        model, roster, app,
        onToggle: (kind, r, on) => {
          touched = true;
          const p = kind === 'session' ? { kind, id: r.key || r.id, name: r.name } : { kind, id: r.id, name: r.name };
          const rest = choice.principals.filter((x) => !(x.kind === p.kind && x.id === p.id));
          choice = { ...choice, principals: on ? [...rest, p] : rest };
          render(); draw();
        },
        onMode: (m) => { touched = true; choice = { ...choice, mode: m }; render(); draw(); },
      });
    };
    draw();
  };
  render();
  return {
    render,
    /** The share a launch of the app `key` carries (null = nothing to share: hidden, auto). */
    shareFor(key) {
      if (!isLocal()) return null;
      const s = launchShare({ touched, choice, map: REACH_MAP || {}, key });
      return s.principals.length || s.mode !== 'auto' ? s : null;
    },
    /** After a successful launch: the choice the user made in THIS dialog is what that app proposes next time. */
    remember(key, share) {
      if (!touched || !key) return;
      REACH_MAP = setProposal(REACH_MAP || {}, key, share || { principals: [], mode: 'auto' });
      fetchJson('/api/user-state', { method: 'PATCH', headers: JSON_HDR, body: JSON.stringify({ [REACH_KEY]: REACH_MAP }) }).then((r) => { if (r && r.error) showToast(t('Could not remember the share for this app') + `: ${r.error}`, { type: 'error' }); });
    },
    /** After a launch that applied the app's REMEMBERED share (the row untouched): say so, and where to change it. */
    announce(key, share, r) {
      if (touched || !share || !r || !r.reach) return;
      const text = launchedToastText(launchSummary({ touched: false, proposal: share, roster: rosterOf(app) }));
      if (text) showToast(text, { duration: 7000 });
    },
    /** The containers whose `.desktop-launch-card[data-app-id]` cards carry the per-app chip (re-painted on every render). */
    decorateCards(containers) { cardHosts = (Array.isArray(containers) ? containers : [containers]).filter(Boolean); paintCards(); },
    /** What the row holds (the suite reads it). */
    state: () => ({ touched, choice: { ...choice, principals: choice.principals.map((p) => ({ ...p })) } }),
    proposalFor: (key) => proposalOf(REACH_MAP || {}, key),
  };
}

/** A route failure in words (the server's sentence is English and exact; the code picks the plain one). */
function failText(r, fallback) {
  const c = r && r.code;
  if (c === 'share_local_only') return t('Only windows on this machine can be shared with an agent');
  if (c === 'agent_forbidden') return t('Only you can share a window');
  if (c === 'no_conversation') return t('That agent has no conversation yet — say something to it first');
  if (c === 'fork_pending') return t('That agent is a fork that has not announced its own conversation yet — try again in a moment');
  if (c === 'not_live') return t('That agent session is not running any more');
  return (r && r.error) || fallback;
}

/** "Share with agent…" (D2 after launch, D7 the mode). */
export async function openShareDialog(app, id, { label = '' } = {}) {
  const base = `/api/desktop/apps/${encodeURIComponent(id)}/reach`;
  const { body, close, overlay, dialog } = createModalShell({ id: 'window-share-dialog', title: t('Share {app} with agents', { app: label || t('Desktop app') }), dialogClass: 'wshare-dialog', escapeToClose: true });
  // the house footer (utils' _modalShell shape): a secondary action left of the primary one
  const footer = el('div', 'dialog-footer');
  const ask = el('button', 'btn-cancel', t('Ask an agent to take control…')); ask.type = 'button';
  ask.onclick = () => { close(); openAskDialog(app, id, { label }); };
  const done = el('button', 'btn-create', t('Done')); done.type = 'button'; done.onclick = () => close();
  footer.append(ask, done);
  dialog.appendChild(footer);
  let view = await fetchJson(base);
  if (!view || view.error) { close(); showToast(failText(view, t('Could not read who this window is shared with')), { type: 'error' }); return null; }
  let busy = false;
  // built ONCE — a repaint updates the lease line, the picker (patched in place: the box keeps its text and
  // its focus) and the note; it never empties the dialog
  body.appendChild(el('p', 'wshare-intro', t('Hidden from every agent until you share it. The agents and Task Groups you pick can see and control this window; removing one takes it away at once.')));
  const leaseEl = el('p', 'wshare-lease', '');
  const host = el('div', '');
  const noteEl = el('div', 'wshare-note', '');
  body.append(leaseEl, host, noteEl);
  const draw = () => {
    leaseEl.textContent = view.lease && view.lease.sessionId ? t('Held right now by {name}', { name: view.lease.sessionName || view.lease.sessionId }) : '';
    leaseEl.style.display = leaseEl.textContent ? '' : 'none';
    const roster = rosterOf(app);
    const model = pickerModel({ ...roster, record: view });
    renderPicker(host, {
      model, busy, roster, app,
      onToggle: async (kind, r, on) => {
        busy = true; draw();
        const principal = kind === 'session' ? { kind, id: r.id || r.key, name: r.name } : { kind, id: r.id, name: r.name }; // a LIVE session by its webui id — the ENGINE spells its durable key (verify r6, lane channel-withdraw: a pending fork's key is its placeholder, never its parent's conversation key; the client's `r.key` was the parent's)
        const res = await fetchJson(base, { method: on ? 'POST' : 'DELETE', headers: JSON_HDR, body: JSON.stringify({ principal }) });
        busy = false;
        if (!res || res.error) showToast(failText(res, on ? t('Could not share the window') : t('Could not stop sharing the window')), { type: 'error' });
        else { view = res; if (!on && res.revoked && res.revoked.leaseDropped) showToast(kind === 'everyone' ? t('The agent that held this window no longer reaches it') : t('{name} no longer holds this window', { name: r.name || r.id })); }
        if (overlay.isConnected) draw();
      },
      onMode: async (m) => {
        busy = true; draw();
        const res = await fetchJson(`${base}/mode`, { method: 'PUT', headers: JSON_HDR, body: JSON.stringify({ mode: m }) });
        busy = false;
        if (!res || res.error) showToast(failText(res, t('Could not change how agents see the window')), { type: 'error' });
        else view = res;
        if (overlay.isConnected) draw();
      },
    });
    const resolved = view.modeInfo && view.mode === 'auto' && view.modeInfo.resolved ? t('Right now: {mode}', { mode: modeLabel(view.modeInfo.resolved) }) : '';
    noteEl.textContent = `${t('A change takes effect at the agent\'s next action.')}${resolved ? ' ' + resolved : ''}`;
  };
  draw();
  const off = app.ws.onGlobal(async (m) => {
    if (m.type !== 'window-reach-updated' || busy || !overlay.isConnected) return;
    if (!(m.reach || []).some((v) => v && v.handle === id)) return;
    const fresh = await fetchJson(base);
    if (fresh && !fresh.error && overlay.isConnected && !busy) { view = fresh; draw(); }
  });
  const obs = new MutationObserver(() => { if (!overlay.isConnected) { try { off?.(); } catch { } obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
  return { close };
}

/** "Ask an agent to take control…" (D3). */
export async function openAskDialog(app, id, { label = '' } = {}) {
  const view = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/reach`);
  if (!view || view.error) { showToast(failText(view, t('Could not read this window')), { type: 'error' }); return null; }
  const { body, close, dialog } = createModalShell({ id: 'window-ask-dialog', title: t('Ask an agent to take control of {app}', { app: label || t('Desktop app') }), dialogClass: 'wshare-dialog', escapeToClose: true });
  const footer = el('div', 'dialog-footer');
  dialog.appendChild(footer);
  const model = pickerModel({ ...rosterOf(app), record: view });
  const agents = model.sessions.filter((s) => s.hasConversation);
  if (!agents.length) {
    body.appendChild(el('p', 'wshare-intro', t('No agent with a conversation is running — start one, say something to it, then ask again.')));
    const b = el('button', 'btn-create', t('Close')); b.type = 'button'; b.onclick = () => close();
    footer.appendChild(b);
    return { close };
  }
  body.appendChild(el('p', 'wshare-intro', t('The agent gets a message naming this window and is given access to it.')));
  // the ONE picker, single-select: the agents with a conversation (key = the webui session id — the route's `sessionId`)
  const live = new Map((rosterOf(app).sessions || []).map((s) => [s.id, s]));
  const pick = principalPicker({
    items: agents.map((s) => { const w = live.get(s.id) || {}; return { key: s.id, kind: 'agent', id: s.key, name: s.name, folder: folderTail(w.cwd), backend: w.backend || 'claude', live: true, groupIds: [], groupNames: [] }; }),
    selected: agents.length ? [agents[0].id] : [], placeholder: t('Search agents…'), label: t('Agent'), onChange: () => sync(),
  });
  pick.el.classList.add('wshare-agent');
  const pickedId = () => pick.selected()[0] || '';
  const note = document.createElement('textarea'); note.className = 'wshare-note-input'; note.rows = 3; note.maxLength = 1000; note.placeholder = t('What should it do? (optional)');
  const wakeLab = el('label', 'dialog-check-row wshare-row');
  const wake = document.createElement('input'); wake.type = 'checkbox'; wake.checked = false;
  wakeLab.append(wake, el('span', 'wshare-who', t('Wake it now (starts a billed turn)')));
  const explain = el('div', 'wshare-note', '');
  const lease = view.lease && view.lease.sessionId ? view.lease : null;
  const holdLab = el('label', 'dialog-check-row wshare-row');
  const hold = document.createElement('input'); hold.type = 'checkbox'; hold.checked = true;
  holdLab.append(hold, el('span', 'wshare-who', lease ? t('End {name}\'s hold on this window', { name: lease.sessionName || lease.sessionId }) : ''));
  const sync = () => {
    explain.textContent = wake.checked ? t('It starts now — a billed turn, counted against the unattended-turn budget.') : t('It sees your request on its next turn — nothing is billed until then.');
    holdLab.style.display = lease && lease.sessionId !== pickedId() ? '' : 'none';
  };
  wake.onchange = sync;
  body.append(el('div', 'wshare-sec', t('Agent')), pick.el, note, wakeLab, holdLab, explain);
  const cancel = el('button', 'btn-cancel', t('Cancel')); cancel.type = 'button'; cancel.onclick = () => close();
  const send = el('button', 'btn-create', t('Send')); send.type = 'button';
  send.onclick = async () => {
    send.disabled = true;
    const sid = pickedId();
    if (!sid) { send.disabled = false; showToast(t('Pick an agent.'), { type: 'error' }); return; }
    const who = (agents.find((s) => s.id === sid) || {}).name || sid;
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/reach/request`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ sessionId: sid, note: note.value, wake: wake.checked, endHold: !!(lease && lease.sessionId !== sid && hold.checked) }) });
    send.disabled = false;
    if (!r || r.error) { showToast(failText(r, t('Could not send the request')), { type: 'error' }); return; }
    close();
    showToast(askResultText(r, who), r.delivered === 'woken' || !r.whyCode ? undefined : { duration: 7000 });
  };
  footer.append(cancel, send);
  sync();
  setTimeout(() => { try { note.focus({ preventScroll: true }); } catch { } }, 0);
  return { close };
}
/** The request's answer in words (PURE over the route's answer — the suite drives it). */
export function askResultText(r, name) {
  if (r && r.delivered === 'woken') return t('Woken — {name} is taking control now', { name });
  if (!r || !r.whyCode) return t('Sent — {name} sees it on its next turn', { name });
  const why = r.whyCode === 'spend' ? t('the unattended-turn budget is used up') : r.whyCode === 'wake_paced' ? t('it was woken less than 30 s ago') : t('no live connection to it');
  return t('Not woken ({why}) — {name} sees it on its next turn', { why, name });
}
