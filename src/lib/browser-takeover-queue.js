// THE TAKEOVER QUEUE (lane browser-takeover-queue — a fleet power user, 2026-10-23: 「我觉得可以在 browser 这个里面加一个像
// Chatbot 的 outbox 一样的功能。经常会有很多时候它会需要我这边 take over 操作嘛，那所有等待我 take over 的都在这里集中一下，
// 然后这样我多个 task 并行的时候都可以在这集中处理这些需要 take over 的东西」).
//
// ONE RECORD (PURE src/browser-takeover-request.js — the keeper writes it) seen in every place from ONE client copy
// (`app._browserTakeovers`: GET /api/browser/takeovers at boot, then every `browser-takeovers-updated` broadcast):
//   · the Agent browser window's «Waiting for you» section — `createTakeoverSection` (keyed rows patched in place: a
//     broadcast never rebuilds a row whose words did not move), the window's title count;
//   · the For-you item — its action runs `openTakeover` (src/lib/user-todos-actions.js);
//   · the live view's bar — «The agent asks you: …» (src/lib/browser-live-window.js asks `app.browserTakeoverFor`);
//   · the rail's Browser badge — PURE takeoverBadge (src/lib/sidebar-rail.js).
// The acts are the existing roads: Take over = the session's live view with the input side taken (the keeper's takeover
// road, through the view's own socket); Done / Hand back = POST /api/browser/takeovers/:id/done (a taken one is the
// explicit handback); Reply = the request's For-you item's reply (the ONE typing road — the agent reads it as the person's
// message; the request stays open).
import { t, tc } from './i18n.js';
import { fetchJson, showToast, showInputDialog } from './utils.js';
import { agoText } from './user-todos-row.js';
import { waitingCount } from '../browser-takeover-request.js';

const EPHEMERAL_REF = '~ephemeral'; // src/browser-stream.js EPHEMERAL_REF — the conversation's own browser (the live view's `profile=`)
const clock = (ms) => { const d = new Date(Number(ms) || 0); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };

/** The live session row of a request's conversation (found by its BROWSER KEY — the webui id may have changed since it asked). */
export function sessionOfRequest(app, req) {
  const rows = (app && app.sidebar && Array.isArray(app.sidebar._allSessions)) ? app.sidebar._allSessions : [];
  return rows.find((s) => s && req && s.browserKey === req.browserKey && s.webuiId) || rows.find((s) => s && req && req.sessionId && s.webuiId === req.sessionId) || null;
}
/** The conversation's name as this client knows it, else the one the request carried. */
export function requestConversationName(app, req) {
  const s = sessionOfRequest(app, req);
  return String((s && (s.webuiName || s.name)) || (req && req.conversationName) || t('a conversation'));
}

/** TAKE OVER: the session's live view on THAT browser, the input side taken at once (`take: false` = offered — the view
 *  opens with its Take over button, the agent's words in its bar). */
export function openTakeover(app, req, { take = true } = {}) {
  const s = sessionOfRequest(app, req);
  if (!s) { showToast(t('That conversation is not running here any more'), { type: 'error' }); return null; }
  return app.openBrowserLive({ sessionId: s.webuiId, profileId: req.profileId || EPHEMERAL_REF, takeOnOpen: !!take });
}
/** DONE / HAND BACK: a taken request is handed back (the explicit handback — the agent is told the page); a waiting one is
 *  resolved done (the agent is told once). */
export async function markTakeoverDone(app, req) {
  const r = await fetchJson(`/api/browser/takeovers/${encodeURIComponent(req.id)}/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (r && r.ok) { showToast(r.how === 'handback' ? t('Handed back — the agent is told the page you left it on') : t('Done — the agent is told')); return true; }
  showToast(r && r.code === 'closed' ? t('That request was already resolved') : (r && r.error) || t('server unreachable'), { type: 'error' });
  return false;
}
/** REPLY: one line to the agent, no takeover — through the request's For-you item (the ONE reply road). */
export async function replyToTakeover(app, req) {
  if (!req.itemId) { showToast(t('This request has no For-you item to reply through — open its conversation'), { type: 'error' }); return false; }
  const text = await showInputDialog({ title: t('Reply to the agent'), label: t('The agent asks you: {words}', { words: req.text }), placeholder: t('One line — the agent reads it as your message'), confirmText: t('Send') });
  if (text == null || !String(text).trim()) return false;
  const r = await fetchJson(`/api/user-todos/${encodeURIComponent(req.itemId)}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: String(text).trim() }) });
  if (r && r.ok) { showToast(t('Reply sent')); return true; }
  showToast(t('Could not reply: {why}', { why: (r && r.error) || t('server unreachable') }), { type: 'error' });
  return false;
}
/** The conversation's own window (a click on its name): its window raised, or re-attached when none is open. */
export function revealTakeoverConversation(app, req) {
  const s = sessionOfRequest(app, req);
  if (!s) { showToast(t('That conversation is not running here any more'), { type: 'error' }); return; }
  const hasWindow = [...(app.sessions ? app.sessions.values() : [])].some((term) => term && term.sessionId === s.webuiId);
  if (hasWindow) app.goToWindow(s.webuiId);
  else app.attachSession(s.webuiId, s.webuiName || s.name || s.webuiId, s.cwd, { mode: s.webuiMode });
}

/** The section's words for one row (PURE over the request + now): state line, page line. */
export function takeoverRowWords(req, now = Date.now()) {
  const page = req.title || req.url || '';
  const state = req.state === 'taken' ? t('you are driving · since {time}', { time: clock(req.takenAt) })
    : req.parked ? t('waiting · {ago} · set aside in For you', { ago: agoText(req.askedAt, t) })
      : t('waiting · {ago}', { ago: agoText(req.askedAt, t) });
  return { state, page, words: req.text, live: req.live !== false };
}

/**
 * «Waiting for you» — the section the Agent browser window draws ABOVE Profiles. Keyed rows (request id → row), patched in
 * place; `render(list)` with the current list (the window passes `app._browserTakeovers`). → {el, render, rows, dispose}
 */
export function createTakeoverSection(app) {
  const sec = el('div', 'bprof-section btq-section');
  const head = el('div', 'bprof-section-head');
  const title = el('span', 'bprof-section-title', tc('takeover', 'Waiting for you'));
  const sub = el('span', 'bprof-section-sub chat-status-dim', '');
  head.append(title, sub);
  const list = el('div', 'btq-list');
  const empty = el('div', 'bprof-empty chat-status-dim btq-empty', t('No browser is waiting for you'));
  sec.append(head, list, empty);
  const rows = new Map(); // request id → { row, sig, parts }
  const act = (label, cls, title0, fn) => { const b = el('button', 'file-tool-btn bprof-btn btq-act ' + cls, label); b.type = 'button'; if (title0) b.title = title0; b.onclick = (ev) => { ev.stopPropagation(); fn(); }; return b; };
  function buildRow(req) {
    const row = el('div', 'btq-row');
    row.dataset.requestId = req.id;
    const top = el('div', 'btq-top');
    const who = el('button', 'btq-conv'); who.type = 'button'; who.title = t('Go to this conversation');
    who.onclick = () => revealTakeoverConversation(app, req);
    const prof = el('span', 'btq-profile browser-chip');
    const state = el('span', 'btq-state chat-status-dim');
    top.append(who, prof, state);
    const words = el('div', 'btq-words');
    const page = el('div', 'btq-page chat-status-dim');
    const acts = el('div', 'btq-acts');
    row.append(top, words, page, acts);
    return { row, parts: { who, prof, state, words, page, acts } };
  }
  function patchRow(entry, req) {
    const w = takeoverRowWords(req);
    const p = entry.parts;
    const name = requestConversationName(app, req);
    if (p.who.textContent !== name) p.who.textContent = name;
    const pl = req.profileLabel || t('its own browser');
    if (p.prof.textContent !== pl) p.prof.textContent = pl;
    if (p.state.textContent !== w.state) p.state.textContent = w.state;
    const said = t('The agent asks you: {words}', { words: w.words });
    if (p.words.textContent !== said) p.words.textContent = said;
    p.words.title = w.words;
    const pg = w.page ? t('Page: {page}', { page: w.page }) : '';
    if (p.page.textContent !== pg) p.page.textContent = pg;
    p.page.title = req.url || '';
    p.page.style.display = pg ? '' : 'none';
    entry.row.classList.toggle('btq-taken', req.state === 'taken');
    entry.row.classList.toggle('btq-gone', !w.live);
    // the acts — rebuilt only when the state moved (a broadcast of the same state keeps the very buttons under the pointer)
    const actSig = [req.state, w.live, !!req.itemId].join('|');
    if (entry.actSig !== actSig) {
      entry.actSig = actSig;
      p.acts.replaceChildren();
      if (!w.live) p.acts.appendChild(el('span', 'chat-status-dim btq-note', t('The conversation is not running — its live view opens when it runs again')));
      else if (req.state === 'taken') {
        p.acts.append(act(t('Open live view'), 'btq-open', t('Go to the live view you are driving'), () => openTakeover(app, req, { take: false })),
          act(t('Hand back'), 'btq-done btq-primary', t('Hand the controls back to the agent — it is told the current URL'), () => markTakeoverDone(app, req)));
      } else {
        p.acts.append(act(t('Take over'), 'btq-take btq-primary', t('Open its live view with the controls yours — the agent waits until you hand back'), () => openTakeover(app, req, { take: true })),
          act(t('Done'), 'btq-done', t('It is done (you did it elsewhere, or it is no longer needed) — the agent is told'), () => markTakeoverDone(app, req)),
          act(t('Reply'), 'btq-reply', t('One line to the agent, without taking over'), () => replyToTakeover(app, req)));
      }
    }
  }
  function render(listIn) {
    const reqs = Array.isArray(listIn) ? listIn : [];
    const seen = new Set();
    let prev = null;
    for (const req of reqs) {
      if (!req || !req.id) continue;
      seen.add(req.id);
      let entry = rows.get(req.id);
      if (!entry) { entry = buildRow(req); rows.set(req.id, entry); }
      const sig = JSON.stringify([req, requestConversationName(app, req), Math.floor(Date.now() / 60000)]);
      if (entry.sig !== sig) { entry.sig = sig; patchRow(entry, req); }
      // keep the order without moving a row that already sits right
      const want = prev ? prev.nextSibling : list.firstChild;
      if (want !== entry.row) list.insertBefore(entry.row, want);
      prev = entry.row;
    }
    for (const [id, entry] of [...rows]) if (!seen.has(id)) { entry.row.remove(); rows.delete(id); }
    const n = waitingCount(reqs);
    sub.textContent = reqs.length ? (n ? t('{n} waiting', { n }) : t('you are driving')) : '';
    empty.style.display = reqs.length ? 'none' : '';
    sec.classList.toggle('btq-has', reqs.length > 0);
    return { n, shown: reqs.length };
  }
  return { el: sec, render, rows: () => [...rows.keys()], dispose: () => rows.clear() };
}
/** The window's title with the count («Agent browser · 2 waiting for you»). */
export function takeoverWindowTitle(n) { return n > 0 ? t('Agent browser · {n} waiting for you', { n }) : t('Agent browser'); }

/** The App's ONE copy of the queue + its listeners (the window, the rail, every live view). */
export function installBrowserTakeovers(App) {
  App.prototype.refreshBrowserTakeovers = function () {
    return fetchJson('/api/browser/takeovers').then((d) => { if (d && !d.error && Array.isArray(d.requests)) this._setBrowserTakeovers(d.requests); return this._browserTakeovers || []; }).catch(() => this._browserTakeovers || []);
  };
  App.prototype._setBrowserTakeovers = function (list) {
    this._browserTakeovers = Array.isArray(list) ? list : [];
    for (const fn of [...(this._browserTakeoverHooks || [])]) { try { fn(this._browserTakeovers); } catch (e) { console.warn('[browser] takeover hook failed', e); } }
  };
  App.prototype._onBrowserTakeoversUpdated = function (msg) { if (msg && Array.isArray(msg.requests)) this._setBrowserTakeovers(msg.requests); };
  /** Subscribe to the queue (called at once with the current list when one is known). → unsubscribe */
  App.prototype.onBrowserTakeovers = function (fn) {
    if (typeof fn !== 'function') return () => {};
    if (!this._browserTakeoverHooks) this._browserTakeoverHooks = new Set();
    this._browserTakeoverHooks.add(fn);
    if (Array.isArray(this._browserTakeovers)) { try { fn(this._browserTakeovers); } catch { /* the hook's own failure */ } }
    return () => { this._browserTakeoverHooks && this._browserTakeoverHooks.delete(fn); };
  };
  /** The OPEN request a live view of (session, browser) shows in its bar: `target` = the view's stream target (kind,
   *  profileId) — null when none. */
  App.prototype.browserTakeoverFor = function (sessionId, target) {
    const list = Array.isArray(this._browserTakeovers) ? this._browserTakeovers : [];
    const rows = (this.sidebar && Array.isArray(this.sidebar._allSessions)) ? this.sidebar._allSessions : [];
    const s = rows.find((x) => x && x.webuiId === sessionId) || null;
    const bk = s && s.browserKey ? s.browserKey : null;
    if (!target) return null;
    return list.find((r) => r && (bk ? r.browserKey === bk : r.sessionId === sessionId) && (r.profileId ? r.profileId === target.profileId : (target.kind === 'ephemeral' && !target.child))) || null;
  };
}
