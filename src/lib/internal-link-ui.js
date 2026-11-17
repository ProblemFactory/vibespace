// THE PRESS OF A LINK OF THE SCHEME (lane login-request-card piece 1 — the design's «Internal links»; the owner, 2026-11-16: chat may
// carry VibeSpace-internal links that open a conversation or jump to a desktop). The plan is PURE (src/internal-link.js pressPlan — one
// table per target); every act here is the page's OWN door, none written twice: a built window → app.goToWinId (its desktop, its tab,
// the flash — the sidebar's, the window list's and For-you's go-to); a row on a desktop not built → desktopManager.switchTo + the same
// go-to; running with no window → app.attachSession, then a toast naming the desktop on show; ENDED with no window → the two-item menu
// («Resume here» = app.resumeSession with the row's own options, no first message · «Read its history» = app.viewSession); archived → a
// toast naming the door; a desktop → switchTo; a setting → app.openSettingAt. A PRESS ONLY NAVIGATES: nothing here sends, ends,
// archives or grants. Right-click / long-press = «Go» · «Copy link».
import { t, tc } from './i18n.js';
import { showToast, showContextMenu, copyText } from './utils.js';
import { pressPlan, linkOf } from '../internal-link.js'; // PURE (CJS): THE grammar + THE table of presses
import { sessionRowOf } from './user-todos-actions.js'; // THE row a conversation key names (the sidebar's own key derivation, exported once)
import { agentOptsOf } from './session-card.js'; // a row's resume / view options (ONE definition)

const backendOf = (key) => { const i = String(key || '').indexOf(':'); return i > 0 ? String(key).slice(0, i) : ''; };
const idOf = (key) => { const i = String(key || '').indexOf(':'); return i > 0 ? String(key).slice(i + 1) : ''; };
const nameOfRow = (app, s) => { try { return app.sidebar?.getCustomName?.(s) || s.name || ''; } catch { return s.name || ''; } };

/** The window of conversation `key` built on this page (live or history) → its window id, or null. */
export function builtWindowOf(app, key, row = null) {
  const backend = backendOf(key), cid = idOf(key);
  for (const [winId, term] of app?.sessions || []) {
    const spec = app.wm?.windows?.get(winId)?._openSpec;
    if (spec && (spec.backend || 'claude') === backend && String(spec.backendSessionId || '') === cid) return winId;
    if (row?.webuiId && term?.sessionId === row.webuiId) return winId;
  }
  return null;
}

/** What this page knows of a target → { state: 'known' | 'unknown' | 'unsure', name }. `unsure` = the page has not read its list
 *  yet (a link drawn before the sidebar's first answer): drawn as a link with no name; the press asks again. */
export function targetOf(app, kind, ref) {
  if (kind === 'conversation') {
    const list = app?.sidebar?._allSessions;
    const row = sessionRowOf(app, ref);
    if (row) return { state: 'known', name: nameOfRow(app, row) };
    if (builtWindowOf(app, ref)) return { state: 'known', name: '' };
    return { state: list && list.length ? 'unknown' : 'unsure', name: '' };
  }
  if (kind === 'desktop') {
    const desks = app?.desktopManager?.desktops || [];
    const d = desks.find((x) => x && x.id === ref);
    return d ? { state: 'known', name: d.name || '' } : { state: desks.length ? 'unknown' : 'unsure', name: '' };
  }
  return { state: 'known', name: '' };
}

/** The page's facts for a press on `kind`/`ref` (pressPlan's input). */
export function pressFacts(app, kind, ref) {
  if (kind === 'desktop') return { has: (app?.desktopManager?.desktops || []).some((x) => x && x.id === ref) };
  if (kind !== 'conversation') return {};
  const s = sessionRowOf(app, ref);
  const win = builtWindowOf(app, ref, s);
  const dm = app?.desktopManager;
  const held = !win ? dm?.heldRowOf?.({ backend: backendOf(ref), backendSessionId: idOf(ref), hostId: s?.host || null }) : null;
  const heldDesk = held && held.desk && held.desk !== dm.activeDesktopId ? held.desk : null;
  let archived = false;
  try { archived = !!(s && app.sidebar?.isArchived?.(s)); } catch { }
  const row = s ? { live: !!s.webuiId, ended: s.status === 'stopped', archived } : null;
  return { win, heldDesk, held, row, s };
}

const IO = { toast: showToast, menu: showContextMenu, copy: copyText };   // the page's own toast / menu / clipboard (a suite passes its recorders)

/** THE PRESS. `at` = {x, y} of the press (the ENDED-no-window menu opens there). → the plan's name (for the caller's log). */
export function pressLink(app, kind, ref, at = {}, io = IO) {
  const f = pressFacts(app, kind, ref);
  const plan = pressPlan(kind, f);
  const dm = app?.desktopManager;
  const s = f.s;
  if (plan === 'win') app.goToWinId(f.win);
  else if (plan === 'desk') Promise.resolve(dm.switchTo(f.heldDesk)).then(() => { const w = f.held && app.wm?.windows?.get(f.held.id) ? f.held.id : builtWindowOf(app, ref, s); if (w) app.goToWinId(w); });
  else if (plan === 'attach') {
    app.attachSession(s.webuiId, s.webuiName || nameOfRow(app, s), s.cwd, { mode: s.webuiMode, ...agentOptsOf(s) });
    const desk = (dm?.desktops || []).find((d) => d && d.id === dm.activeDesktopId);
    io.toast(t('Opened on {desktop} — it had no window.', { desktop: desk?.name || '' }));
  } else if (plan === 'menu') {
    const name = nameOfRow(app, s), opts = agentOptsOf(s);
    io.menu(at.x || 0, at.y || 0, [
      { label: tc('link', 'Resume here'), action: () => app.resumeSession(s.sessionId, s.cwd, name, opts) },
      { label: t('Read its history'), action: () => app.viewSession(s.sessionId, s.cwd, name, opts) },
    ]);
  } else if (plan === 'archived') io.toast(t('This conversation is archived — open it from the archived list in the sidebar.'));
  else if (plan === 'outside') io.toast(t('This session is running outside VibeSpace'), { type: 'error' });
  else if (plan === 'switch') dm.switchTo(ref);
  else if (plan === 'settings') app.openSettingAt?.(ref);
  else io.toast(kind === 'desktop' ? t('unknown desktop') : t('unknown conversation'), { type: 'error' });
  return plan;
}

/** Right-click / long-press: «Go» · «Copy link». `flash(words)` = the caller's own «Copied!». */
export function linkMenu(app, kind, ref, at = {}, flash = null, io = IO) {
  io.menu(at.x || 0, at.y || 0, [
    { label: t('Go'), action: () => pressLink(app, kind, ref, at, io) },
    { label: t('Copy link'), action: () => Promise.resolve(io.copy(linkOf(kind, ref))).then(() => { if (flash) flash(t('Copied!')); }) },
  ]);
}
