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
/** The window's chip — "Shared with 2 · Pixels" ('' when nobody). `view` = a reach view (GET …/reach / the broadcast). */
export function shareChipText(view) {
  if (!view || !Array.isArray(view.rows) || !view.rows.length) return '';
  const s = view.summary || shareSummary(view, view.resolved);
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

/**
 * THE PICKER — ONE renderer for the three surfaces. `model` = PURE pickerModel's answer. `onToggle(kind, row, on)`,
 * `onMode(mode)`; `busy` greys everything while a write is in flight.
 */
export function renderPicker(container, { model, onToggle, onMode, busy = false, showMode = true } = {}) {
  container.textContent = '';
  container.classList.add('wshare-picker');
  // the house CHECKBOX ROW (`label.dialog-check-row`: box left of its name, a hint under the name — it out-ranks
  // `.dialog-body label`'s column flex, which stacked the box above its text)
  const row = (kind, r, name, sub, checked) => {
    const lab = el('label', 'dialog-check-row wshare-row');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!checked; cb.disabled = busy;
    cb.dataset.kind = kind; cb.dataset.id = kind === 'session' ? (r.key || r.id) : r.id;
    cb.onchange = () => onToggle?.(kind, r, cb.checked);
    const who = el('span', 'wshare-who', name);
    lab.append(cb, who);
    if (sub) lab.appendChild(el('span', 'dialog-check-hint', sub));
    return lab;
  };
  container.appendChild(el('div', 'wshare-sec', t('Agents')));
  if (!model.sessions.length) container.appendChild(el('div', 'wshare-empty', t('No agent session is running')));
  for (const s of model.sessions) container.appendChild(row('session', s, s.name, s.checked && s.by && s.by !== 'user' ? originWord(s.by) : '', s.checked));
  for (const o of model.others) if (o.principal.kind === 'session') container.appendChild(row('session', { id: o.principal.id, key: o.principal.id, name: o.principal.name }, o.principal.name || o.principal.id, t('not running now'), true));
  container.appendChild(el('div', 'wshare-sec', t('Task Groups')));
  if (!model.groups.length) container.appendChild(el('div', 'wshare-empty', t('No Task Group yet')));
  for (const g of model.groups) container.appendChild(row('group', g, g.name, g.checked ? t('every session in it, now or later') : '', g.checked));
  for (const o of model.others) if (o.principal.kind === 'group') container.appendChild(row('group', { id: o.principal.id, name: o.principal.name }, o.principal.name || o.principal.id, t('not in the list now'), true));
  if (!showMode) return container;
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
  return container;
}

// ── the per-app launch memory (user state `desktopAppReach`) — loaded once per page, kept in step by the broadcast ──
let REACH_MAP = null;
let mapWired = false;
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
  fetchJson('/api/user-state').then((st) => { if (REACH_MAP === null) { REACH_MAP = st && st[REACH_KEY] && typeof st[REACH_KEY] === 'object' ? { ...st[REACH_KEY] } : {}; notifyMap(); } });
}
/** The key a launch's choice is remembered under (the desktopAppFrame key): the registry id, else `exec:<basename>`. */
export const launchKeyOf = (payload) => frameKeyOf(payload && payload.appId ? { appId: payload.appId } : { exec: payload && payload.exec });

/** One principal in words — lane E verify r2 (M2): a principal `launchSummary` read against the roster says when it is
 *  gone, in the picker's own words ("alpha (not running now)", "Ops (not in the list now)"); a listed one carries its
 *  CURRENT name (principalsNow). */
function nameOf(p) {
  const name = p.name || p.id;
  if (p.absent === 'session') return t('{name} ({state})', { name, state: t('not running now') });
  if (p.absent === 'group') return t('{name} ({state})', { name, state: t('not in the list now') });
  return name;
}
/** Who a share names, in a few words ("alpha, Ops…"). */
function namesOf(principals) {
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
      const model = pickerModel({ ...rosterOf(app), record: { mode: choice.mode, rows: [] }, principals: choice.principals });
      renderPicker(pop, {
        model,
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
  const draw = () => {
    body.textContent = '';
    body.appendChild(el('p', 'wshare-intro', t('Hidden from every agent until you share it. Checked agents and Task Groups can see and control this window; unchecking takes it away at once.')));
    if (view.lease && view.lease.sessionId) body.appendChild(el('p', 'wshare-lease', t('Held right now by {name}', { name: view.lease.sessionName || view.lease.sessionId })));
    const host = el('div', '');
    const model = pickerModel({ ...rosterOf(app), record: view });
    renderPicker(host, {
      model, busy,
      onToggle: async (kind, r, on) => {
        busy = true; draw();
        const principal = kind === 'session' ? { kind, id: r.key || r.id, name: r.name } : { kind, id: r.id, name: r.name }; // a session by its durable key (the server's own spelling — R.sessionKeyOf)
        const res = await fetchJson(base, { method: on ? 'POST' : 'DELETE', headers: JSON_HDR, body: JSON.stringify({ principal }) });
        busy = false;
        if (!res || res.error) showToast(failText(res, on ? t('Could not share the window') : t('Could not stop sharing the window')), { type: 'error' });
        else { view = res; if (!on && res.revoked && res.revoked.leaseDropped) showToast(t('{name} no longer holds this window', { name: r.name || r.id })); }
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
    body.appendChild(host);
    const resolved = view.modeInfo && view.mode === 'auto' && view.modeInfo.resolved ? t('Right now: {mode}', { mode: modeLabel(view.modeInfo.resolved) }) : '';
    body.appendChild(el('div', 'wshare-note', `${t('A change takes effect at the agent\'s next action.')}${resolved ? ' ' + resolved : ''}`));
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
  const pick = document.createElement('select'); pick.className = 'wshare-agent';
  for (const s of agents) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; pick.appendChild(o); }
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
    holdLab.style.display = lease && lease.sessionId !== pick.value ? '' : 'none';
  };
  wake.onchange = sync; pick.onchange = sync;
  body.append(el('div', 'wshare-sec', t('Agent')), pick, note, wakeLab, holdLab, explain);
  const cancel = el('button', 'btn-cancel', t('Cancel')); cancel.type = 'button'; cancel.onclick = () => close();
  const send = el('button', 'btn-create', t('Send')); send.type = 'button';
  send.onclick = async () => {
    send.disabled = true;
    const who = (agents.find((s) => s.id === pick.value) || {}).name || pick.value;
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/reach/request`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ sessionId: pick.value, note: note.value, wake: wake.checked, endHold: !!(lease && lease.sessionId !== pick.value && hold.checked) }) });
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
