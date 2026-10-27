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
import { t, resolveLang } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { replyButtonState, liveDotState, LIVE_DOT_WHY, restoreDetails, badgeWords } from './user-todos-layout.js'; // PURE: the reply verdict + the running dot (design-user-inbox-reply D1.5/D1.7); restoreDetails = the whole detail this client already saw survives a snapshot that previews it
import { showInstallDialog, launchDpr, launchUiScale } from './desktop-app-launcher.js';
import { appRefusalText } from './app-install-dialog.js'; // a refusal code → the user's words (busy, a decided proposal…)
import { shownDigest, openRowOf } from './app-card-model.js'; // design 009: the digest of the card pressed; the row an Installed card opens // Layer 0 apps: THE install dialog an agent's install proposal opens (the same component as "Install xpra on {machine}…")
import { openResetCreditDialog } from './reset-credit-dialog.js'; // THE one reset-credit confirm dialog (design-reset-credits p2): the ask-mode item's button
import { showReauthAccountDialog } from './channel-account-dialogs.js'; // lane channel-names-readable: a `channel-reauth` item's verb = THE account's Re-authorize dialog
import { askArtifactRow, askArtifactProbe, linkTarget } from './foryou-links.js'; // PURE (lane foryou-attachments): an ask's chip → its artifact row + the open-time probe; a link in the words → its target
import { clearRecords, isCleared, clearedText } from './record-clear-ui.js'; // "Clear content…" (2026-09-28): THE confirm dialog + request path; a cleared item's words
import { revealLeftMs, revealHeaders, askRevealPassword, forgetReveal } from './vault-reveal.js'; // lane vault-run-door: a held run's «always» asks 验证是你 FIRST, in the press's own task
import { replyBoxView } from '../inbox-reply.js'; // PURE (lane inbox-reply-dead-session): THE reply box both surfaces draw — never disabled
import { grantUseBody, grantReplyText } from '../ask-grant.js'; // PURE (lane controls-that-lie): an ask that names a grant — the PATCH it plans, the answer the agent reads
import { openTakeover } from './browser-takeover-queue.js'; // lane browser-takeover-queue: a takeover request's item opens its live view
import { refusalWords as whoRefusalWords } from './browser-who-model.js'; // «Who can use it»'s own refusal words (the dialog's)
import { titleWords } from '../channel-api-card.js'; // PURE (lane card-grammar-exceptions): a raw-API proposal's item says its card's title
import { postSecretAnswer } from './vault-paste-box.js'; // lane vault-paste-request: a paste request's answer (the value rides ONE body, never a toast)
import { isPointer, clockWords } from '../foryou-actions.js'; // PURE (lane wake-approve-card r3): a pointer hides — its ✕ is «Hide», no Undo; r4: an expired ask's end in words
import { askOptions } from '../ask-options.js'; // PURE (lane foryou-honest): an ask's chips — the explicit options, else its detail's «A …；B …» / «是 / 否» parsed

/** The badge's tiers — ONE spelling shared by the taskbar / nav button, the
 *  popup's Inbox tab and the window's Actions tab (B-328d: "same words as the badge"). */
export function tierCounts(action) {
  const cu = action.filter((i) => i.urgency === 'urgent').length;
  const ch = action.filter((i) => i.urgency === 'high').length;
  return { cu, ch, cn: action.length - cu - ch };
}
/** …and its WORDS ("2 urgent · 1 normal — waiting on you"). lane foryou-honest (the stress evaluation's P1-1): `total` =
 *  THE honest count (user-todos-layout openCount — every open action item, `action` = its loud bands-1–4 part): with any
 *  item open the words never say «Nothing waiting on you» — a quiet-only count reads «21 waiting on you — none pressing»,
 *  a loud one adds «· 18 more, none pressing». */
export function actionWords(action, total = action.length) { return badgeWords(action, total, t); } // the sentence is PURE (user-todos-layout.js badgeWords)

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
  // card grammar (lane card-grammar-exceptions): a raw-API proposal says its CARD's title (`card.head`, the words the
  // chat card and the Outbox row say — never the raw path), worded here like the card does
  // lane vault-key-row-compact: a param may be WORDS (`{key}` — a verb's own words): said in this language before the sentence is filled
  const said = (l) => t(l.key, Object.fromEntries(Object.entries(l.params || {}).map(([k, v]) => [k, v && typeof v === 'object' && typeof v.key === 'string' ? t(v.key) : v])));
  const wordsOf = (i) => (isCleared(i) ? clearedText() : i && i.card && i.card.kind === 'api-call' && i.card.head ? titleWords(i.card.head, { t, lang: resolveLang() }) : i && i.i18n && i.i18n.text ? said(i.i18n.text) : (i && i.text) || '');
  /** The detail as LINES (the Vault window's band: its first line is a use failure's cause, the rest sit under one fold). */
  const detailLinesOf = (i) => (isCleared(i) ? [] : i && i.i18n && Array.isArray(i.i18n.detail) && i.i18n.detail.length ? i.i18n.detail.map(said) : String((i && i.detail) || '').split('\n').filter(Boolean));
  const detailOf = (i) => (isCleared(i) ? '' : i && i.i18n && Array.isArray(i.i18n.detail) && i.i18n.detail.length ? detailLinesOf(i).join('\n') : (i && i.detail) || '');
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
    // lane foryou-plugin-notices: an item that DECLARES its door (`open` — src/user-todos.js normalizeOpen) opens THERE: a
    // plugin's reminder lands on the plugin's own sheet with what it suggests already chosen (its key is no session — the
    // click used to end in "Session not found")
    if (item?.open?.kind === 'plugin-settings') { close(); app.openPluginDoor?.(item.open); return; }
    if (key === 'jobs') { close(); app.openJobs?.(); return; }
    // Account-level items (login-session expiry, 2026-09-07) belong to the
    // INSTANCE, not a session — the actionable surface is Manage Agents, the
    // same shape the 'jobs' bucket uses. Without this branch the click fell
    // through to "Session not found in the list yet", i.e. a dead end on an
    // item whose whole point is that the user must act.
    if (key === 'accounts') { close(); app._showAgentsDialog?.(); return; }
    // B-c127: an item ABOUT a channel conversation (an approval pointer, a reach request, an unknown outcome) opens
    // THAT conversation — its 'channels' group is no session, and the click used to end in "Session not found"
    if (item?.action?.type === 'open-channel' && item.action.adapterId && item.action.convId) { close(); app.openChannel?.(item.action.adapterId, item.action.convId); return; }
    // lane vault-relock-door: the restart notice's door opens the unlock dialog (its key 'vault' is no session; the body click used to end in "Session not found")
    if (item?.action?.type === 'vault-unlock') { close(); try { window.dispatchEvent(new CustomEvent('vs-vault-door')); } catch { } return; }
    // lane vault-window-v2: a failed use / a rotate suggestion lands on ITS row in the Vault window (the window's 「需要你」 draws the same item)
    if (item?.action?.type === 'vault-use-failed' || item?.action?.type === 'vault-rotate') { close(); app.replayOpenSpec?.({ action: 'openVault', focus: String(item.action.entry || '') }); return; }
    // lane device-upgrade-stuck: a machine-level item (a device agent whose update failed) lands on Manage Agents → Machines
    if (key === 'machines') { close(); try { localStorage.setItem('vibespace.agentsTab', 'machines'); } catch { } app._showAgentsDialog?.(); return; }
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
      if ((item?.action?.type === 'helper-ask' || item?.action?.type === 'main-ask') && item.action.requestId) { // lane parked-ask-inbox: a conversation's own ask too
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
  // ── WHAT AN ITEM SHOWS (lane foryou-attachments, owner 2026-10-09 "经常 agent 会让我 review 一个产物/文件/网页，我却没法
  // 轻易从 inbox 里打开") — its --artifact chips and the paths / links in its words; ONE verb each for the tray and the window ──
  /** A chip: the open-time re-check (a file / design / page gone since the ask ⇒ a toast that SAYS so, never silent), then
   *  THE ONE artifact open door (artifacts-window.js openArtifactRow — the asking conversation's chat view when this client
   *  shows it, else the row's own facts: a file in its viewer on its host, a design in the Design window, a page by /p/). */
  const openArtifact = async (item, k) => {
    const a = item && Array.isArray(item.artifacts) ? item.artifacts[k] : null;
    const row = askArtifactRow(a);
    if (!row) return false;
    const pr = askArtifactProbe(a);
    let gone = false;
    try {
      const r = await fetch(pr.url, { method: pr.method });
      const j = pr.method === 'GET' ? await r.json().catch(() => null) : null;
      gone = !r.ok || !!(j && (j.error || (row.kind !== 'design' && j.isDirectory)));
    } catch { gone = false; } // unreachable server: the door says what it can
    if (gone) { showToast(row.kind === 'page' ? t('{name} is no longer published', { name: row.name }) : t('{name} is gone — nothing at {path} any more', { name: row.name, path: row.path }), { type: 'error', history: { m: t('An attachment is gone'), ref: { kind: 'todo', id: item.id } } }); return false; } // the history keeps the head + a ref, never the item's words
    const s = sessionFor(item.sessionKey);
    const { openArtifactRow } = await import('./artifacts-window.js');
    openArtifactRow(app, (s && s.webuiId) || '', row);
    return true;
  };
  /** A link in the words (src/lib/foryou-links.js): a URL / mail address / page per the chat's link convention (a new
   *  tab); a path probed on the ASKER's host against its cwd (the chat's candidates) — a folder opens the explorer there,
   *  nothing found ⇒ a toast that says so. */
  const openLink = async (item, kind, ref) => {
    const tg = linkTarget(kind, ref, { cwd: (item && item.cwd) || '', host: (item && item.hostId) || '' });
    if (!tg) return false;
    if (tg.open === 'url' || tg.open === 'mail') { window.open(tg.href, '_blank', 'noopener'); return true; }
    if (tg.open === 'page') { window.open(new URL(tg.path, location.origin).href, '_blank', 'noopener'); return true; }
    const host = tg.host || undefined;
    for (const c of tg.cands) {
      const info = await fetchJson(`/api/file/info?path=${encodeURIComponent(c)}${host ? '&host=' + encodeURIComponent(host) : ''}`);
      if (!info || info.error) continue;
      if (info.isDirectory) app.openFileExplorer?.(c, { host });
      else app.openFile?.(c, c.split('/').pop(), { host, ...(tg.line ? { line: tg.line } : {}) });
      return true;
    }
    showToast(t('Not found: {path}', { path: String(ref) }), { type: 'error', history: { m: t('A link in an item was not found'), ref: { kind: 'todo', id: item && item.id } } });
    return false;
  };
  /** ✓ / ✕ / ↺ → POST /api/user-todos/:id. Resolves true on success. */
  const setStatus = async (id, status) => {
    // fetchJson never throws (returns null / the parsed {error} body) — check
    // the success flag or the failure is a silent no-op.
    const r = await fetchJson(`/api/user-todos/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r || !r.success) { showToast(t('Could not update the item') + (r?.error ? `: ${r.error}` : ''), { type: 'error' }); return false; }
    return true;
  };
  /** Does `jump` open the item's own DOOR (a job's form, a plugin's sheet, Manage Agents, a channel, the vault) rather than its
   *  conversation? (jump's own early returns, in its order) — a tray row's body tap still opens a door; only a jump to the
   *  conversation became «open the row in place» (lane foryou-honest P3-8). */
  const isDoor = (key, item) => !!(item?.jobId || item?.open?.kind === 'plugin-settings' || key === 'jobs' || key === 'accounts' || key === 'machines'
    || (item?.action?.type === 'open-channel' && item.action.adapterId && item.action.convId)
    || ['vault-unlock', 'vault-use-failed', 'vault-rotate'].includes(item?.action?.type));
  /** ✓ / ✕ ON AN ITEM (lane foryou-honest, the stress evaluation's P3-2: one press decided it — no toast, the ↺ two screens
   *  away): the status POST, then ONE toast with Undo for 6 s — the ↺ road (status open) on the same item. */
  const resolveOne = async (id, status) => {
    const hide = isPointer(byId(id)); // lane wake-approve-card r3: A POINTER HIDES — said as such, no Undo (it comes back by itself while it is open)
    const ok = await setStatus(id, status);
    if (ok && hide) { showToast(t('Hidden — nothing was decided; it comes back while it is still open'), { duration: 6000 }); return ok; }
    if (ok) showToast(status === 'done' ? t('Marked done') : t('Dismissed'), { duration: 6000, actions: [{ label: t('Undo'), run: () => setStatus(id, 'open') }] });
    return ok;
  };
  /** THE CHIPS OF AN ITEM (PURE askOptions over the words this device shows): the agent's options, else its detail's. */
  const optionsFor = (i) => askOptions(i, detailOf(i));
  /** «Mark all read» (lane inbox-fyi-mark-all) — THE notices' bulk verb (the window's notices tab, the popup's and the
   *  phone page's notices head): ONE POST for every id (PURE noticeReadAll chose them) ⇒ the store's ONE write + ONE
   *  broadcast, so every count drops in the same tick on every client; then a 5 s Undo toast that brings exactly the
   *  notices this press read back open (…/unread). A failure is said by name. Resolves the ids it read (null = refused). */
  const readNotices = async (ids) => {
    const list = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string' && x) : [];
    if (!list.length) return [];
    const post = (door, body) => fetchJson(`/api/user-todos/notices/${door}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const r = await post('read-all', { ids: list });
    if (!r || !r.ok) { showToast(t('Could not update {n} items: {why}', { n: list.length, why: r && r.error ? r.error : t('server unreachable') }), { type: 'error' }); return null; }
    const read = Array.isArray(r.changed) ? r.changed : [];
    if (read.length) {
      showToast(t('{n} notices marked read', { n: read.length }), { duration: 5000, actions: [{ label: t('Undo'), run: async () => {
        const u = await post('unread', { ids: read });
        if (!u || !u.ok) showToast(t('Could not update {n} items: {why}', { n: read.length, why: u && u.error ? u.error : t('server unreachable') }), { type: 'error' });
      } }] });
    }
    return read;
  };
  /** A reply REOPENED its ended conversation (lane inbox-reply-dead-session): that conversation's window opens on THIS
   *  page — a window still showing it ended (a read-only / view-only one) is closed first, as a hand Resume does. */
  const openReopened = (r) => {
    const c = (r && r.conversation) || {};
    try {
      for (const [winId, term] of [...app.sessions]) {
        const spec = app.wm?.windows?.get(winId)?._openSpec;
        if (spec && c.backendSessionId && (spec.backend || 'claude') === (c.backend || 'claude') && spec.backendSessionId === c.backendSessionId && term?.sessionId !== r.sessionId) app.wm.closeWindow(winId);
      }
    } catch { }
    try { app.attachSession(r.sessionId, c.name || '', c.cwd || '', { mode: 'chat', backend: c.backend || 'claude', backendSessionId: c.backendSessionId || undefined, hostId: c.hostId || undefined }); }
    catch (e) { showToast(t('Could not open the conversation: {why}', { why: e.message }), { type: 'error' }); }
  };
  // THIS page's last refused send per item ({code, why}) — the box's note says it until the next send (never silent)
  const replyFailures = new Map();
  /** THE REPLY (design-user-inbox-reply D1): POST /api/user-todos/:id/reply —
   *  the typing path, quoted. Both outcomes reach the user as a toast; resolves
   *  true when the reply was sent (the caller then clears its box + draft). A
   *  reply to a conversation that ENDED reopens it (`reopened` — its window opens here). */
  const postReply = async (id, text, { sentToast = null } = {}) => {   // `sentToast` (lane controls-that-lie): a grant's own words replace «Reply sent»
    // fetchJson never throws — a null (network) or an {error, code} body is a
    // FAILURE the user must see (no silent failures); the box keeps its text
    const r = await fetchJson(`/api/user-todos/${encodeURIComponent(id)}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (r && r.ok) {
      replyFailures.delete(id); drafts.delete(id);
      if (r.reopened) { showToast(t('Reopened the conversation and sent your reply')); openReopened(r); }
      else showToast(sentToast || t('Reply sent'));
      return true;
    }
    const why = r && r.error ? t(r.error) : t('server unreachable');
    replyFailures.set(id, { code: (r && r.code) || 'unreachable', why });
    if (r && r.reopened && r.sessionId) openReopened(r); // reopened, but the reply did not go: the conversation is open — show it
    showToast(r && r.code === 'resume_failed' ? t('Could not reopen the conversation: {why}', { why }) : t('Could not reply: {why}', { why }), { type: 'error' });
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
  /** AN ASK THAT NAMES A GRANT, PERFORMED (lane controls-that-lie, naive study round 4 R1 — «Granted access» only typed two
   *  words): «Who can use it» gains the asking conversation through the owner's OWN door — the dialog's fresh GET + its
   *  whole-list PATCH with the `base` it read (src/lib/browser-who-dialog.js) — and ONLY THEN the agent is answered on the
   *  reply road (the item resolves `by your reply`, the words in it are `grantReplyText`'s). A refusal is said by name and
   *  the item stays open; nothing is typed to the agent before the grant landed. Resolves true when both ran. */
  const grantBrowser = async (rec) => {
    const pid = String(rec.action.profileId || ''), label = String(rec.action.label || pid);
    const live = sessionFor(rec.sessionKey);
    const sid = live && live.webuiId ? String(live.webuiId) : '';
    let plan = null;
    for (let attempt = 0; attempt < 2; attempt++) {   // a list another window changed between the read and the write (409 list-changed): read it again, once
      const view = sid ? await fetchJson(`/api/browser/profiles/${encodeURIComponent(pid)}/use`) : null;
      if (sid && (!view || view.error)) { showToast(t('Could not change who can use it') + ' — ' + ((view && view.error) || t('server unreachable')), { type: 'error', duration: 9000 }); return false; }
      plan = grantUseBody(view, sid);
      if (plan.error === 'no-session') { showToast(t('The conversation that asked is not running — open it, then press again'), { type: 'error', duration: 9000 }); return false; }
      if (plan.error) { showToast(t('Could not change who can use it') + ' — ' + t('the list could not be read; open the Agent browser panel → {label} → Who can use it', { label }), { type: 'error', duration: 9000 }); return false; }
      if (plan.already) break;
      const r = await fetchJson(`/api/browser/profiles/${encodeURIComponent(pid)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ use: plan.use, base: plan.base }) });
      if (r && !r.error) break;
      if (r && r.code === 'list-changed' && attempt === 0) continue;
      showToast(whoRefusalWords(r, t) || (t('Could not change who can use it') + ' — ' + ((r && r.error) || t('server unreachable'))), { type: 'error', duration: 9000 });
      return false;
    }
    return postReply(rec.id, grantReplyText({ label, profileId: pid, already: !!plan.already }), {
      sentToast: plan.already ? t('{label} was already open to this conversation — the agent was told', { label }) : t('{label}: this conversation may use it now — the agent was told', { label }),
    });
  };
  /** A PRODUCER'S ACTION (design-reset-credits p2): the client maps the item's
   *  `action.type` to a verb it owns. Today: the reset-credit confirm dialog. */
  const runAction = async (rec, answer = null, extra = {}) => {   // `extra.reach` (lane key-instance-scope): an automation card's picked reach
    if (rec && rec.action && rec.action.type === 'browser-grant') return grantBrowser(rec);
    if (rec && rec.action && rec.action.type === 'browser-takeover') {
      // lane browser-takeover-queue: ONE record — the item IS the request: its live view, the input side offered (the view's
      // Take over; the agent's words in its bar); the request as the app's queue holds it (else the item's own facts)
      const req = (app._browserTakeovers || []).find((r) => r && r.id === rec.action.requestId) || { id: rec.action.requestId, browserKey: rec.action.browserKey, profileId: rec.action.profileId || null, sessionId: null };
      return !!openTakeover(app, req, { take: false });
    }
    if (rec && rec.action && rec.action.type === 'channel-reauth') {
      // lane channel-names-readable: the account's sign-in lacks a permission — ITS Re-authorize dialog (the channels
      // engine resolves the item once the permission works)
      const d = await fetchJson('/api/channels?scope=accounts');
      const acct = d && !d.error ? (d.adapters || []).find((x) => x.id === rec.action.adapterId) : null;
      if (!acct) { showToast((d && d.error) || t('That account is gone'), { type: 'error' }); return false; }
      showReauthAccountDialog(app, acct, { kinds: d.kinds || [] });
      return true;
    }
    if (rec && rec.action && rec.action.type === 'desktop-app-notify') {
      // lane app-display-notify-sink: an app's notification that needed the person — its window, raised; the hub resolves the item
      const appId = String(rec.action.appId || '');
      app.openDesktopApp(appId);
      const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(appId)}/notifications/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return !!(r && r.ok);
    }
    if (rec && rec.action && rec.action.type === 'browser-restart') {
      // lane browser-unresponsive: a HUNG browser's ONE way out — THE user's Restart (cookie route; the keeper's recovery
      // tells every conversation on it and resolves this item)
      const r = await fetchJson(`/api/browser/profiles/${encodeURIComponent(rec.action.profileId)}/restart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r && r.browser) { showToast(t('Restarted {label}', { label: String(r.browser.label || rec.action.profileId) })); return true; }
      showToast((r && r.error) || t('Could not restart the browser'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'browser-floor-check') {
      // B-0b8c (lane browser-probe-transient): the browser-version notice's Check again — ONE probe now (cookie route); an
      // answer withdraws the item server-side, a miss is said and the item stays
      const r = await fetchJson('/api/browser/floor/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r && r.floor && r.floor.state !== 'unknown') { showToast(t('The browser version reads again: {version}', { version: String(r.version || t('not installed')) })); return true; }
      showToast((r && r.error) || t('Still no answer: {why}', { why: String((r && r.lastProbe && r.lastProbe.why) || t('no answer')) }), { type: 'error' });
      return false;
    }
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
    if (rec && rec.action && rec.action.type === 'hub-act-ask') {
      // lane hub-act-ask (design q-042 D4): THE person's answer to a hub act held on a cluster instance (cookie route; any
      // bearer is refused human_only) — once / always (the machine's Hub automation list → Always allow, every kind) / deny.
      // The server resolves the item; a failure is said, never swallowed.
      const r = await fetchJson(`/api/hub-acts/asks/${encodeURIComponent(rec.action.askId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }) });
      if (r && r.ok) { showToast(r.state === 'always' ? t('Always allowed on {machine} — its Hub automation is Always allow now', { machine: String(r.machine || rec.action.machine || '') }) : r.state === 'allowed' ? t('allowed') : t('denied')); return true; }
      const code = r && r.code;
      showToast(code === 'ask_settled' ? t('Already answered') : code === 'ask_expired' ? t('Too late — it was refused after 60 s') : code === 'ask_unknown' ? t('That request is gone') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'pool-cross-provider') {
      // q-053 P0b (decision ①): THE owner's answer to a pool's move to ANOTHER provider (cookie route; an agent's bearer is
      // refused) — once (this conversation, now) / always (the pool's crossProvider = allow) / deny. The engine re-judges
      // before anything moves and says what it found; the item is resolved server-side.
      const r = await fetchJson(`/api/accounts/pool-cross/asks/${encodeURIComponent(rec.action.askId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }) });
      if (r && r.ok) {
        showToast(r.state === 'denied' ? t('denied') : r.moved ? (r.state === 'always' ? t('Moved — this pool now moves a conversation to another provider by itself') : t('Moved — the conversation restarts on the other provider')) : r.why === 'gone' ? t('Nothing moved — the conversation is gone') : r.why === 'own-provider-again' ? t('Nothing moved — a member of its own provider can take it again') : r.why === 'no-client' ? t('Nothing moved — no open page could restart it; the pool asks again') : t('Nothing moved — that member cannot take it now'));
        return true;
      }
      showToast(r && r.code === 'ask_unknown' ? t('That request is gone') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'automation-ask') {
      // design q-046 (lane automation-keys-core): THE person's answer to an automation call held for a grant (cookie route;
      // any bearer is refused human_only) — once (this call) / always (the key granted to that conversation) / deny.
      // lane key-instance-scope: + the grant's REACH the card offered (opened / groups / instance; absent = opened)
      const reach = extra && typeof extra.reach === 'string' && extra.reach ? extra.reach : null;
      const r = await fetchJson(`/api/automation/asks/${encodeURIComponent(rec.action.askId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer, ...(reach ? { reach } : {}) }) });
      if (r && r.ok) { showToast(r.state === 'always' ? (reach === 'instance' ? t('Granted — the key now reaches every conversation here from that conversation (the Vault window lists it)') : t('Granted — the key is listed with this conversation in the Vault window')) : r.state === 'allowed' ? t('allowed') : t('denied')); return true; }
      const code = r && r.code;
      showToast(code === 'ask_settled' ? t('Already answered') : code === 'ask_expired' ? t('Too late — it was refused after 60 s') : code === 'ask_unknown' ? t('That request is gone') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'vault-run-ask') {
      // lane vault-run-door (design q-043 §8.3): THE person's answer to an agent's run held on its card (cookie route; any
      // bearer is refused human_only) — once (this run) / always (this command SHAPE for this conversation, 30 days: the
      // second password again — 验证是你 opens FIRST, in the press's own task, never a round trip late) / deny.
      if (answer === 'always' && !revealLeftMs() && !(await askRevealPassword())) return false;
      const r = await fetchJson(`/api/vault/run/asks/${encodeURIComponent(rec.action.askId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(answer === 'always' ? revealHeaders() : {}) }, body: JSON.stringify({ answer }) });
      if (r && r.ok) { showToast(r.outcome === 'always' ? t('Allowed for this shape for 30 days') : r.outcome === 'allowed' ? t('allowed') : t('denied')); return true; }   // `outcome` (the vault door lays its facts' `state` over an answer)
      const code = r && r.code;
      if (code === 'reveal_needs_password') forgetReveal();
      showToast(code === 'ask_settled' ? t('Already answered') : code === 'ask_expired' ? t('Too late — it was refused after 60 s') : code === 'ask_unknown' ? t('That request is gone')
        : code === 'ask_changed' ? t('The request changed after it was shown — nothing ran') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'vault-grant-ask') {
      // lane vault-manual-and-lock (design q-043 D4): THE person's answer to an agent's request for a stored secret (cookie
      // route; any bearer is refused human_only) — once (its next run) / 8h (every run for 8 hours) / deny. A click: a grant
      // never outlives 8 hours nor a lock, and each new kind of command still shows its own card. A grant opens the entry the
      // way the row's switch does, so Allow asks 验证是你 FIRST, in the press's own task (Deny is a click).
      if (answer !== 'deny' && !revealLeftMs() && !(await askRevealPassword())) return false;
      const r = await fetchJson(`/api/vault/request/asks/${encodeURIComponent(rec.action.askId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(answer !== 'deny' ? revealHeaders() : {}) }, body: JSON.stringify({ answer }) });
      if (r && r.ok) { showToast(r.outcome === 'granted-8h' ? t('Granted for 8 hours — a lock ends it') : r.outcome === 'granted-once' ? t('Granted for its next run') : t('denied')); return true; }   // `outcome` (the vault door lays its facts' `state` over an answer)
      const code = r && r.code;
      if (code === 'reveal_needs_password') forgetReveal();
      showToast(code === 'ask_settled' ? t('Already answered') : code === 'ask_unknown' ? t('That request is gone')
        : code === 'ask_changed' ? t('The request changed after it was shown — nothing ran') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'secret-request') {
      // lane vault-paste-request: THE owner's answer to an agent's request for a secret (cookie route; any bearer is refused
      // human_only) — store (the field's value, in the request body only) / deny. The server resolves the item and tells the
      // agent on its next turn; a refusal (locked, the field's rule) is said in the box and a toast — never with the value.
      return postSecretAnswer(rec, answer === 'store' ? 'store' : 'deny', { value: answer === 'store' && extra && typeof extra.value === 'string' ? extra.value : null, onRefusal: extra && extra.onRefusal });
    }
    if (rec && rec.action && rec.action.type === 'channel-watch-request') {
      // lane channel-agent-watch W1: an agent asked to be WOKEN by a conversation — Approve writes exactly what the item
      // says, through the access request's own decide route (the one door; never a second approval surface)
      const r = await fetchJson(`/api/channels/reach-requests/${encodeURIComponent(rec.action.id)}/${answer === 'reject' ? 'deny' : 'approve'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r && r.ok) { showToast(answer === 'reject' ? t('Denied — nothing changed') : t('Approved — the agent is woken by it from now on')); return true; }
      // r4: past its end (either side of the minute sweep) ⇒ ONE 409 `expired` with its end — said in the owner's language
      showToast((r && r.code === 'expired') ? t('This request expired on {date} — the agent can ask again', { date: clockWords(r.expiredAt) }) : (r && r.code === 'bad-state') ? t('That request was already decided') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'channel-api-proposal') {
      // B-2198 part 2: the raw-API proposal's Approve / Reject where it appears — the card's own route, naming the digest this item showed
      const id = encodeURIComponent(rec.action.id);
      const r = answer === 'reject'
        ? await fetchJson(`/api/channels/api/proposals/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        : await fetchJson(`/api/channels/api/proposals/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shown: rec.action.shown }) });
      if (r && r.ok) { showToast(answer === 'reject' ? t('Rejected — the agent is told on its next turn') : t('Approved — the card in the conversation shows how it went')); return true; }
      showToast(r && r.code === 'not-pending' ? t('That request was already decided') : r && r.code === 'proposal_changed' ? t('That card changed after it was shown — nothing ran; read it again') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'save-login') {
      // lane browser-login: a person's own sign-in in the agent browser — Save / Update keeps it in the vault, Not now forgets it;
      // the digest of what this row showed rides `shown` (a card that changed since saves nothing)
      const r = await fetchJson(`/api/browser/logins/cards/${encodeURIComponent(rec.action.id)}/${answer === 'reject' ? 'reject' : 'approve'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shown: rec.action.shown }) });
      if (r && r.ok) { showToast(answer === 'reject' ? t('Not saved — the password was forgotten') : r.updated ? t('Updated the login in the vault') : t('Saved the login to the vault')); return true; }
      showToast(r && r.code === 'card_changed' ? t('That card changed after it was shown — nothing was saved; read it again') : r && r.code === 'card_gone' ? t('That card is no longer open — the password was not kept') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'browser-surface') {
      // lane browser-surfaces: a browser prompt only the owner can answer — Approve presses its answer that needs no typing,
      // Reject refuses it; the digest of what this row showed rides `shown` (a prompt that changed since answers nothing)
      const r = await fetchJson(`/api/browser/surfaces/${encodeURIComponent(rec.action.id)}/${answer === 'reject' ? 'reject' : 'approve'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shown: rec.action.shown }) });
      if (r && r.ok) { showToast(answer === 'reject' ? t('Refused — the page was told') : t('Answered — the page moves on')); return true; }
      showToast(r && r.code === 'surface_changed' ? t('That prompt changed after it was shown — nothing was answered; read it again') : r && r.code === 'no_dialog' ? t('That prompt is no longer open') : (r && r.error) || t('server unreachable'), { type: 'error' });
      return false;
    }
    if (rec && rec.action && rec.action.type === 'browser-proposal') {
      // lane browser-propose: THE person's answer to an agent's proposal, where it appears — the same route the chat card
      // presses, with the digest of what this row showed (`shown`); the proposal's card patches itself, the runner answers
      // this item. A refusal is said by name, never swallowed.
      const id = encodeURIComponent(rec.action.id);
      // lane passkey-ui: a passkey card's choice (pk:once | pk:always | pk:no | pk:never) — the approve route with {shown, choice}
      if (/^pk:(once|always|no|never)$/.test(String(answer))) {
        const choice = String(answer).slice(3);
        const rr = await fetchJson(`/api/browser/proposals/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shown: rec.action.shown, choice }) });
        if (rr && rr.ok) { showToast(choice === 'no' || choice === 'never' ? t('Refused — the page was told it was not allowed') : String(rec.action.choices || '') === 'once no' ? t('Allowed — the agent may register the passkey now') : t('Allowed — the page signs in')); return true; }
        showToast(rr && rr.code === 'proposal_changed' ? t('That card changed after it was shown — nothing ran; read it again') : rr && rr.code === 'proposal_state' ? t('That proposal was already decided') : (rr && rr.error) || t('server unreachable'), { type: 'error' });
        return false;
      }
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
    if (rec && rec.action && rec.action.type === 'app-install') {
      // Layer 0 apps (docs/design-app-persistence.zh.md §3.1): an agent's install proposal — Install… opens THE install
      // dialog on it (its fresh plan; the run is the user's press there), Not now declines it. A refusal is said by name.
      const id = String(rec.action.id || '');
      if (answer === 'reject') {
        const r = await fetchJson(`/api/apps/proposals/${encodeURIComponent(id)}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (r && r.ok) { showToast(t('Declined — the agent is told on its next turn')); return true; }
        showToast(r && r.code === 'proposal_state' ? t('That proposal was already decided') : (r && r.error) || t('server unreachable'), { type: 'error' });
        return false;
      }
      const host = rec.action.host || 'local';
      if (answer === 'open') {
        // design 009: Installed · Open — the app the install added, started like a card in Apps
        const row = openRowOf(rec.card);
        if (!row) return false;
        const r = await fetchJson('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: row, dpr: launchDpr(), uiScale: launchUiScale(), ifRunning: 'attach', ...(host !== 'local' ? { host } : {}) }) }); // lane app-launch-singleton: a running one is opened, never started twice
        if (!r || r.error) { showToast((r && r.error) || t('Could not launch the application'), { type: 'error' }); return false; }
        if (r.attached) showToast(t('It was already running — its window is open'));
        app.openDesktopApp(r.id);
        return true;
      }
      if (rec.card) {
        // design 009: THE ONE CLICK — the card's Install (or Try again) runs the stored plan; `shown` = the digest of the card
        // this client drew. A card that is not the proposal as it stands is refused (nothing ran) and re-reads itself.
        const r = await fetchJson(`/api/apps/proposals/${encodeURIComponent(id)}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shown: shownDigest(rec.card) }) });
        if (r && r.ok) return true; // the card follows the run (the store's broadcast)
        const code = r && r.code;
        showToast(code === 'plan_changed' ? t('The plan changed — take another look.') : (code && appRefusalText(code)) || (r && r.error) || t('server unreachable'), { type: 'error' });
        return false;
      }
      showInstallDialog({ hostId: host, label: host !== 'local' ? host : null }, { what: 'app', proposalId: id }); // an item filed before the one card
      return true;
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
  /** THE box both surfaces draw for item `i` (PURE replyBoxView): the verdict's fact said in its note, "Reopen and
   *  send" on an ended conversation, this page's last refusal of it — and never a disabled control. */
  const replyBox = (i) => replyBoxView(replyState(i), replyFailures.get(i.id) || null);
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
    byId, sessionFor, displayName, wordsOf, detailOf, detailLinesOf, nameFor, jump, isDoor, setStatus, resolveOne, optionsFor, readNotices, postReply, runAction, ensureDetail, clearContent, menuFor, isCleared, openArtifact, openLink,
    ingestLive, factFor, keyForWebui, webuiIdsFor, keysFor, replyState, replyBox, patchDot, boardOf, drafts,
    /** THE row renderer's context (src/lib/user-todos-row.js) — the words,
     *  names and the live verdict; a surface passes it (or a copy with its flags) */
    rowCtx: { t, nameFor, wordsOf, detailOf, replyState, optionsOf: optionsFor, lang: resolveLang },
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
  model.rowCtx.replyBox = replyBox; // the row's box (lane inbox-reply-dead-session): never disabled — the fact said, an ended conversation reopened
  app._inboxModel = model;
  return model;
}
