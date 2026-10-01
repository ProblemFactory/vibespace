// THE For-you inbox's CLIENT MODEL — the one store of items on this client and
// every verb on an item, shared by every surface that shows them: the popup +
// the phone sheet + the title-bar mini inbox (src/lib/user-todos-panel.js) and
// the For-you WINDOW (src/lib/inbox-window.js, docs/design-user-inbox-reply.md
// §9, 2026-09-27).
//
// Why a module of its own: the window is a second surface over the SAME items,
// the SAME live facts and the SAME verbs. Everything below moved VERBATIM out
// of user-todos-panel.js (its comments came with it) — the store + the three
// broadcasts, the live facts (`active-sessions` ⇒ the running dot and the reply
// verdict), the words of an item, jump-to-the-session, the status POST, the
// reply POST with its two toasts, the producer's action — so the popup and the
// window cannot drift: one implementation, two painters. Each surface keeps
// only what is its own (the popup's layout while open, its folds, the window's
// selection); a surface SUBSCRIBES (`on('todos' | 'live' | 'status', fn,
// {signal})`) and paints.
//
// `inboxModel(app)` is memoized on the app: the first caller (the panel's
// install at boot) builds it, the window asks for the same one.
import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { replyButtonState, liveDotState, LIVE_DOT_WHY, restoreDetails } from './user-todos-layout.js'; // PURE: the reply verdict + the running dot (design-user-inbox-reply D1.5/D1.7); restoreDetails = the whole detail this client already saw survives a snapshot that previews it
import { openResetCreditDialog } from './reset-credit-dialog.js'; // THE one reset-credit confirm dialog (design-reset-credits p2): the ask-mode item's button
import { clearRecords, isCleared, clearedText } from './record-clear-ui.js'; // "Clear content…" (2026-09-28): THE confirm dialog + request path; a cleared item's words

/** The badge's tiers — ONE spelling shared by the taskbar / nav button, the
 *  popup's Inbox tab and the window's Actions tab (B-328d: "same words as the badge"). */
export function tierCounts(action) {
  const cu = action.filter((i) => i.urgency === 'urgent').length;
  const ch = action.filter((i) => i.urgency === 'high').length;
  return { cu, ch, cn: action.length - cu - ch };
}
/** …and its WORDS ("2 urgent · 1 normal — waiting on you"). */
export function actionWords(action) {
  const { cu, ch, cn } = tierCounts(action);
  return action.length
    ? [cu ? t('{n} urgent', { n: cu }) : '', ch ? t('{n} high', { n: ch }) : '', cn ? t('{n} normal', { n: cn }) : '']
        .filter(Boolean).join(' · ') + ' — ' + t('waiting on you')
    : t('Nothing waiting on you');
}

export function inboxModel(app) {
  if (app._inboxModel) return app._inboxModel;
  let todos = { open: [], resolved: [] };
  let loaded = false; // false until the first snapshot (a surface never judges an empty store it has not read)
  const listeners = { todos: new Set(), live: new Set(), status: new Set() };
  const emit = (kind, arg) => { for (const fn of [...listeners[kind]]) { try { fn(arg); } catch (e) { console.warn('[inbox] listener failed:', e); } } };

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
  // A CLEARED item (clearedAt — "Clear content…", 2026-09-28) reads the cleared sentence in this
  // device's language and has no detail: the store dropped its words, its i18n and its detail
  const wordsOf = (i) => (isCleared(i) ? clearedText() : i && i.i18n && i.i18n.text ? t(i.i18n.text.key, i.i18n.text.params || {}) : (i && i.text) || '');
  const detailOf = (i) => (isCleared(i) ? '' : i && i.i18n && Array.isArray(i.i18n.detail) && i.i18n.detail.length ? i.i18n.detail.map((l) => t(l.key, l.params || {})).join('\n') : (i && i.detail) || '');
  const nameFor = (key, items) => {
    const s = sessionFor(key);
    const spoken = items.find((i) => i.i18n && i.i18n.source && i.i18n.source.key);
    return (s && displayName(s)) || (spoken && t(spoken.i18n.source.key)) || items.find((i) => i.sessionName)?.sessionName
      || (key.includes(':') ? key.split(':')[1].slice(0, 8) : key);
  };
  /** Go to where an item is answered. `close` = the calling surface's own
   *  "I am leaving" (the popup hides itself; the window stays). */
  const jump = (key, item, { close = () => {} } = {}) => {
    // a job-borne item opens its ANSWER surface directly regardless of which
    // group it sits in (2.357.0: items are attributed to the OWNER session
    // now, so the key is usually a real session — the actionable thing is
    // still the job's form, which focusJobsPanel lands on in the sidebar)
    if (item?.jobId) { close(); app.openJobInteract?.(item.jobId); return; }
    if (key === 'jobs') { close(); app.openJobs?.(); return; }
    // Account-level items (login-session expiry, 2026-09-07) belong to the
    // INSTANCE, not a session — the actionable surface is Manage Agents, the
    // same shape the 'jobs' bucket uses. Without this branch the click fell
    // through to "Session not found in the list yet", i.e. a dead end on an
    // item whose whole point is that the user must act.
    if (key === 'accounts') { close(); app._showAgentsDialog?.(); return; }
    const s = sessionFor(key);
    if (!s) { showToast(t('Session not found in the list yet — try from the sidebar'), { type: 'error' }); return; }
    close();
    if (s.webuiId) {
      // goToWindow only works when a window is OPEN for it — a live session
      // whose window was closed needs a re-attach instead of a silent no-op.
      const hasWindow = [...app.sessions.values()].some((term) => term.sessionId === s.webuiId);
      if (hasWindow) app.goToWindow(s.webuiId);
      else app.attachSession(s.webuiId, s.webuiName || displayName(s), s.cwd, { mode: s.webuiMode });
      // A HELPER's ask (lane S1): land ON the card that waits, not just in its conversation.
      // A window opened just now learns its asks from the attach — retried for a few seconds.
      if (item?.action?.type === 'helper-ask' && item.action.requestId) {
        const rid = item.action.requestId;
        let n = 0;
        const tryJump = () => {
          const view = [...app.sessions.values()].find((v) => v && v.sessionId === s.webuiId && typeof v.jumpToPendingAsk === 'function');
          if (view && (view._pendingAsks || []).some((a) => String(a.requestId) === String(rid))) { view.jumpToPendingAsk(rid).catch(() => {}); return; }
          if (++n < 20) setTimeout(tryJump, 250);
        };
        setTimeout(tryJump, 50);
      }
    } else if (s.status === 'tmux') app.attachTmuxSession(s.tmuxTarget, displayName(s), s.cwd);
    else if (s.status === 'stopped') app.resumeSession(s.sessionId, s.cwd, displayName(s), { backend: s.backend, hostId: s.hostId || s.host || undefined });
    else showToast(t('This session is running outside VibeSpace'), { type: 'error' });
  };
  /** ✓ / ✕ / ↺ → POST /api/user-todos/:id. Resolves true on success. */
  const setStatus = async (id, status) => {
    // fetchJson never throws (returns null / the parsed {error} body) — check
    // the success flag or the failure is a silent no-op.
    const r = await fetchJson(`/api/user-todos/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r || !r.success) { showToast(t('Could not update the item') + (r?.error ? `: ${r.error}` : ''), { type: 'error' }); return false; }
    return true;
  };
  /** THE REPLY (design-user-inbox-reply D1): POST /api/user-todos/:id/reply —
   *  the typing path, quoted. Both outcomes reach the user as a toast; resolves
   *  true when the reply was sent (the caller then clears its box + draft). */
  const postReply = async (id, text) => {
    // fetchJson never throws — a null (network) or an {error, code} body is a
    // FAILURE the user must see (no silent failures); the box keeps its text
    const r = await fetchJson(`/api/user-todos/${encodeURIComponent(id)}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (r && r.ok) { showToast(t('Reply sent')); drafts.delete(id); return true; }
    showToast(t('Could not reply: {why}', { why: r && r.error ? t(r.error) : t('server unreachable') }), { type: 'error' });
    return false;
  };
  /** "CLEAR CONTENT…" (2026-09-28): THE verb both surfaces offer on an item's menu —
   *  the ONE confirm dialog (its time + first words), then POST /api/records/clear;
   *  the store's broadcast repaints every client. Resolves true when it cleared. */
  const clearContent = async (id) => {
    const it = byId(id);
    if (!it || isCleared(it)) return false;
    const r = await clearRecords([{ kind: 'todo', id: it.id, at: it.createdAt, words: wordsOf(it) }]);
    return !!(r && r.ok && r.cleared);
  };
  /** The item's context-menu rows (the popup's and the window's): today only Clear content…. */
  const menuFor = (id) => { const it = byId(id); return it && !isCleared(it) ? [{ label: t('Clear content…'), action: () => { clearContent(id); } }] : []; };
  /** A PRODUCER'S ACTION (design-reset-credits p2): the client maps the item's
   *  `action.type` to a verb it owns. Today: the reset-credit confirm dialog. */
  const runAction = async (rec, answer = null) => {
    if (rec && rec.action && rec.action.type === 'exit-run-ask') {
      // lane-pairing ⑥: THE person's answer to an agent's command on a machine (cookie route; an agent's bearer is
      // refused human_only). The server resolves the item; a failure is said, never swallowed.
      const r = await fetchJson(`/api/exits/asks/${encodeURIComponent(rec.action.askId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }) });
      if (r && r.ok) { showToast(r.state === 'allowed' ? t('allowed') : t('denied')); return true; }
      const code = r && r.code;
      const w = code === 'ask_settled' ? t('Already answered') : code === 'ask_expired' ? t('Too late — it was refused after 60 s') : code === 'ask_unknown' ? t('That request is gone')
        : code === 'ask_changed' ? t('The request changed after it was shown — nothing ran') : (r && r.error) || t('server unreachable'); // verify-r5 X1
      showToast(w, { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'browser-proposal') {
      // lane browser-propose: THE person's answer to an agent's proposal, where it appears — the same route the chat card
      // presses, with the digest of what this row showed (`shown`); the proposal's card patches itself, the runner answers
      // this item. A refusal is said by name, never swallowed.
      const id = encodeURIComponent(rec.action.id);
      const r = answer === 'reject'
        ? await fetchJson(`/api/browser/proposals/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        : await fetchJson(`/api/browser/proposals/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shown: rec.action.shown }) });
      if (r && r.ok) { showToast(answer === 'reject' ? t('Rejected — the agent is told the next time it opens that site') : t('Approved — the card in the conversation shows how it goes')); return true; }
      const code = r && r.code;
      const w = code === 'proposal_changed' ? t('That card changed after it was shown — nothing ran; read it again') : code === 'proposal_state' ? t('That proposal was already decided')
        : code === 'proposal_unavailable' ? t('Nothing can be approved here — the card says why') : (r && r.error) || t('server unreachable');
      showToast(w, { type: 'error' });
      return false;
    }
    if (!rec || !rec.action || rec.action.type !== 'reset-credit') return false;
    openResetCreditDialog(app, { accountKey: rec.action.accountKey, sessionId: rec.action.sessionId || null, todoId: rec.id });
    return true;
  };

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
  const keyForWebui = (wid) => keyByWebuiId.get(wid);
  /** The webui ids whose live session reports `key` (a status stored under `webui:<id>`). */
  const webuiIdsFor = (key) => [...keyByWebuiId].filter(([, k]) => k === key).map(([wid]) => wid);
  /** Every key ONE session's items may carry: `key` itself, its `webui:<id>`
   *  twin(s) while the session is live, and — for a `webui:<id>` key — the
   *  payload's own `<backend>:<id>` key. The window's session scope. */
  const keysFor = (key) => {
    if (!key || typeof key !== 'string') return [];
    const out = [key];
    const add = (k) => { if (k && !out.includes(k)) out.push(k); };
    if (key.startsWith('webui:')) add(keyForWebui(key.slice(6)));
    for (const wid of webuiIdsFor(key)) add(`webui:${wid}`);
    return out;
  };
  const replyState = (i) => replyButtonState(i, factFor(i.sessionKey));
  /** A `.ut-live-dot[data-key]` brought to its session's current fact (D1.7). */
  const patchDot = (dot) => {
    const st = liveDotState(factFor(dot.dataset.key));
    if (dot.dataset.state !== st) dot.dataset.state = st;
    const title = t(LIVE_DOT_WHY[st] || LIVE_DOT_WHY.off);
    if (dot.title !== title) { dot.title = title; dot.setAttribute('aria-label', title); }
  };
  // THE BOARD STATE (design-user-inbox-reply §4 h, chunk 4): the session's own
  // board state (vibespace-status) — the sidebar-tasks mixin already holds
  // `_sessionStatuses` and its broadcast; the inbox only reads it. An item keyed
  // `<backend>:<id>` may have its status still under `webui:<id>`.
  const boardWord = (state) => (state === 'needs-input' ? t('needs input') : state === 'blocked' ? t('blocked') : state === 'review' ? t('review') : state === 'working' ? t('working') : '');
  const statusFor = (key) => {
    const st = app.sidebar?._sessionStatuses || {};
    if (st[key]) return st[key];
    for (const wid of webuiIdsFor(key)) if (st[`webui:${wid}`]) return st[`webui:${wid}`];
    return null;
  };
  /** {rec, word, why} of a session's board state ('' word = nothing the chip shows), or null. `why` = the chip's
   *  tooltip: the agent's reason, or — once the owner cleared it — the cleared sentence in THIS device's words (lane-redact
   *  verify r4: both chips printed the stored English key on a zh / ja device). */
  const boardOf = (key) => { const rec = statusFor(key); return rec ? { rec, word: boardWord(rec.state), why: typeof rec.reason === 'string' ? (isCleared(rec) ? clearedText() : rec.reason) : '' } : null; };
  const byId = (id) => todos.open.find((i) => i.id === id) || todos.resolved.find((i) => i.id === id) || null;
  const drafts = new Map(); // item id → the text of a FOLDED / unsent reply box (the popup's, the mini inbox's and the window's — one draft per item)

  // THE WHOLE DETAIL (2026-09-27): a snapshot carries a RESOLVED item's detail as a
  // 300-char preview (`detailTruncated`, the store's previewOf — history never grows the
  // broadcast). `fullById` remembers every whole detail this client has seen, so the
  // item the reader has open never shrinks under them when another client resolves it
  // (PURE restoreDetails); a previewed item this client never saw whole is fetched on
  // demand (ensureDetail → GET /api/user-todos/:id, single-flight, patched in place).
  let fullById = new Map();
  // every snapshot applied bumps `gen`: a list FETCHED before a newer snapshot landed never replaces it (lane-redact verify
  // r5 — the reconnect resync's answer could arrive after a clear's broadcast and bring the item's words back on screen)
  let gen = 0;
  const setTodos = (next) => { gen++; const r = restoreDetails(next || { open: [], resolved: [] }, fullById); todos = r.todos; fullById = r.fullById; loaded = true; emit('todos', todos); };
  const detailLoads = new Map(); // id → the in-flight load (single-flight)
  /** Resolves to `{detail, error}`: the item's whole detail (the item patched in place and
   *  a `todos` emit when the rest arrives), or the reason it could not be loaded — the
   *  caller shows it (no silent failure). An item carried whole answers at once. */
  const ensureDetail = (id) => {
    const it = byId(id);
    if (!it) return Promise.resolve({ detail: null, error: t('item not found') });
    if (!it.detailTruncated) return Promise.resolve({ detail: it.detail, error: null });
    if (detailLoads.has(id)) return detailLoads.get(id);
    const p = fetchJson(`/api/user-todos/${encodeURIComponent(id)}`).then((r) => {
      detailLoads.delete(id);
      const whole = r && r.item && typeof r.item.detail === 'string' ? r.item.detail : null;
      // cleared while the GET was in flight ("Clear content…"): the words it fetched are gone — never hand them to Copy
      if (isCleared(byId(id)) || (r && r.item && isCleared(r.item))) return { detail: '', error: null };
      if (whole == null) return { detail: null, error: r && r.error ? t(r.error) : t('server unreachable') }; // fetchJson never throws: null = unreachable, {error} = the route's word
      fullById.set(id, whole);
      const r2 = restoreDetails(todos, fullById); todos = r2.todos; fullById = r2.fullById;
      emit('todos', todos);
      return { detail: whole, error: null };
    });
    detailLoads.set(id, p);
    return p;
  };
  let liveSeen = false; // a broadcast beat the initial fetch — don't clobber it with the older snapshot
  app.ws.onGlobal((msg) => { if (msg.type === 'user-todos-updated' && msg.todos) { liveSeen = true; setTodos(msg.todos); } });
  // THE LIVE FACTS (D1.7): the session list's own broadcast — the running dot and
  // the reply controls are patched in place, rows are never re-rendered for it
  app.ws.onGlobal((msg) => { if (msg.type === 'active-sessions' && Array.isArray(msg.sessions)) { ingestLive(msg.sessions); emit('live'); } });
  // THE BOARD CHIP (chunk 4): the sidebar-tasks mixin stores the statuses from
  // the same broadcast — told after it (a microtask: handler order is not ours
  // to rely on), chips only, never a row
  app.ws.onGlobal((msg) => { if (msg.type === 'session-status-updated' && msg.statuses) queueMicrotask(() => emit('status')); });
  // Resync on reconnect — items filed while offline would otherwise stay
  // invisible until the next unrelated change re-broadcasts.
  app.ws.onStateChange?.((connected) => {
    if (connected) { const g0 = gen; fetchJson('/api/user-todos').then((d) => { if (d?.todos && gen === g0) setTodos(d.todos); }); }
  });
  fetchJson('/api/user-todos').then((d) => { if (d?.todos && !liveSeen) setTodos(d.todos); });

  const model = {
    get todos() { return todos; },
    get loaded() { return loaded; },
    byId, sessionFor, displayName, wordsOf, detailOf, nameFor, jump, setStatus, postReply, runAction, ensureDetail, clearContent, menuFor, isCleared,
    ingestLive, factFor, keyForWebui, webuiIdsFor, keysFor, replyState, patchDot, boardOf, drafts,
    /** THE row renderer's context (src/lib/user-todos-row.js) — the words,
     *  names and the live verdict; a surface passes it (or a copy with its flags) */
    rowCtx: { t, nameFor, wordsOf, detailOf, replyState },
    /** Subscribe: `todos` (every snapshot, the store's order), `live` (an
     *  active-sessions payload was ingested), `status` (the board statuses
     *  moved). A surface that closes passes its AbortSignal (or calls the
     *  returned off). */
    on(kind, fn, { signal } = {}) {
      const set = listeners[kind];
      if (!set || typeof fn !== 'function') throw new Error(`inboxModel.on: unknown event ${kind}`);
      set.add(fn);
      const off = () => set.delete(fn);
      if (signal) { if (signal.aborted) off(); else signal.addEventListener('abort', off, { once: true }); }
      return off;
    },
  };
  app._inboxModel = model;
  return model;
}
