// THE CLIENT'S OUTBOX STATE (lane outbox-session-chip; the owner, 2026-11-05: «很难 keep track 每个 session 发了哪些、哪些被改过»).
// ONE copy of what the Outbox window receives, BOTH sections: the store's view of the message proposals (GET
// /api/channels/outbox, read when the first reader asks and once more after the socket comes back, then the `outbox` every
// `channel-outbox-updated` broadcast already carries; the Outbox window's own read lands here too — `noteOutbox` — and the
// window DRAWS what this holds: it wires the feed on open and has no socket handler of its own) and the raw-API calls
// (channel-api-card-view's shared records: GET /api/channels/api, re-read on every `channel-api-updated` and after a reconnect).
// Every conversation's «Outbox» chip and the session menu's «Outbox of this conversation» read it through ONE verdict
// (`conversationOutbox` = the PURE src/outbox-chip.js outboxChipOf over `currentRows()` — the rows the filtered window draws).
// No poll, no new route, no new broadcast. AN OLDER VIEW NEVER OVERWRITES A NEWER ONE (acceptance r1 N2): every store view
// carries `at` (channels-outbound.js outboxView); a read's answer stamped before the held view is dropped, never re-told.
// The words are `outboxChipFace` (every string through t — the chip reaches innerHTML escaped).
import { t } from './i18n.js';
import { outboxChipOf } from '../outbox-chip.js';
import { fateOf as apiFate } from '../channel-api-card.js';
import { onApiCards, refreshApiCards } from './channel-api-card-view.js';

let latest = null;
let apiHeld = null;
let wiredWs = null;
let apiOff = null;
let reading = false;
const subs = new Set();

/** The store's view `{proposals, accounts, at, …}` the client holds now (null = not read yet / no channels). */
export function currentOutbox() { return latest; }

/** THE ROWS the client holds of both Outbox sections — `{proposals, apiCards}`, what the Outbox window draws. */
export function currentRows() { return { proposals: latest ? latest.proposals : [], apiCards: apiHeld || [] }; }

/** THE chip's verdict for a conversation (its keys) over the held rows — the chat chip and the session menu ask this ONE call. */
export function conversationOutbox(keys) { return outboxChipOf(currentRows(), keys, { apiFate }); }

function tell() {
  const rows = currentRows();
  for (const fn of [...subs]) { try { fn(rows); } catch (err) { console.error('[outbox-feed] reader failed:', err); } }
}

const stampOf = (ob) => (ob && typeof ob.at === 'number' && Number.isFinite(ob.at) ? ob.at : null);

/** A view of the store (a broadcast's `outbox` — `push` — or a read's answer). Held and told to every reader unless it is
 *  OLDER than the held one: stamped before it, or stamped the same instant by a read (a read can be computed before the
 *  change a push of that instant carries; the socket's pushes arrive in order, so a push of the same instant is the later
 *  state). An unstamped view is taken. Returns the view held now (the window draws it). */
export function noteOutbox(ob, { push = false } = {}) {
  if (!ob || !Array.isArray(ob.proposals)) return latest;
  const a = stampOf(ob), h = stampOf(latest);
  if (a !== null && h !== null && (a < h || (a === h && !push))) return latest;
  latest = ob;
  tell();
  return latest;
}

function readOutboxView() {
  if (reading || typeof fetch !== 'function') return;
  reading = true;
  fetch('/api/channels/outbox').then((r) => (r && r.ok ? r.json() : null)).then((ob) => { reading = false; if (ob && !ob.error) noteOutbox(ob); }).catch(() => { reading = false; });
}

/** Wire the feed to this page's socket ONCE (a second app / socket re-wires — a test page builds its own). */
export function wireOutboxFeed(app) {
  const ws = app && app.ws;
  if (!ws || typeof ws.onGlobal !== 'function' || wiredWs === ws) return;
  wiredWs = ws;
  ws.onGlobal((msg) => { if (msg && msg.type === 'channel-outbox-updated' && msg.outbox) noteOutbox(msg.outbox, { push: true }); });
  // a broadcast missed while the socket was down is read back once when it returns (never a timer) — BOTH halves (acceptance
  // r2 m4): the store's view and the API records (a `channel-api-updated` missed too left the chip's calls and «M waiting» on
  // a call already run); one read of each per reconnect
  let up = true;
  if (typeof ws.onStateChange === 'function') ws.onStateChange((now) => { if (now && !up) { readOutboxView(); refreshApiCards({ changed: true }); } up = !!now; });
  // the raw-API section's rows: the shared records every API surface follows (one read, re-read on `channel-api-updated`)
  if (apiOff) { try { apiOff(); } catch { } }
  apiOff = onApiCards(app, (recs) => { apiHeld = Array.isArray(recs) ? recs : []; tell(); });
  readOutboxView();
}

/** Hear every change of the held rows — `fn(currentRows())` now (if anything is held) and on every change; returns the unsubscribe. */
export function onOutbox(app, fn) {
  wireOutboxFeed(app);
  subs.add(fn);
  if (latest || apiHeld) { try { fn(currentRows()); } catch (err) { console.error('[outbox-feed] reader failed:', err); } }
  return () => { subs.delete(fn); };
}

/** The chat chip's face for a verdict (`outboxChipOf`): `{text, waiting, cls, tip}` — null when the conversation drafted
 *  nothing (no chip). «Outbox · N» (its message proposals and API calls); while M await the owner the accent class + «M waiting». */
export function outboxChipFace(v) {
  if (!v || !(v.total > 0)) return null;
  const parts = [
    v.waiting ? t('{n} waiting', { n: v.waiting }) : '',
    v.edited ? t('{n} edited by you', { n: v.edited }) : '',
    v.sent ? t('{n} sent', { n: v.sent }) : '',
    v.partly ? t('{n} partly sent', { n: v.partly }) : '',
    v.failed ? t('{n} failed', { n: v.failed }) : '',
    v.replaced ? t('{n} replaced', { n: v.replaced }) : '',
    v.calls ? t('{n} API calls', { n: v.calls }) : '',
  ].filter(Boolean);
  return {
    text: t('Outbox · {n}', { n: v.total }),
    waiting: v.waiting ? t('{n} waiting', { n: v.waiting }) : '',
    cls: 'chat-status-outbox chat-status-clickable' + (v.waiting ? ' chat-status-outbox-waiting' : ''),
    tip: t('Proposals this conversation drafted — click to see only them in the Outbox') + (parts.length ? '\n' + parts.join(' · ') : ''),
  };
}
