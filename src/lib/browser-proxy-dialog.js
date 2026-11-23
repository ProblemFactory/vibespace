// «Proxy…» — a browser profile card's proxy and its login (B-8b87, lane cli-update-needs-nothing). The person's edit: the address
// alone, its login from the vault (src/lib/browser-proxy-field.js); applied at the browser's next start (PATCH, a person's — an
// agent's token is refused by the route).
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';
import { mountProxyField } from './browser-proxy-field.js';
import { proxyWords, proxyDoor } from './browser-proxy-model.js';
import { showUnlock, showSetup, unlockThen, vaultFacts } from './vault-unlock.js';
import { joinSentences } from './browser-exit-words.js';   // B-7aef r2927: a road's own sentence, then the proxy's

// B-acb9 (r226): the forms ONE of their own saves ended, keyed by the form's overlay. A second open of the same profile RAISES the
// live form and hands its caller that same overlay, so the word every caller hears is the FORM's — never one call's local.
const SAVED = new WeakSet();
export function openProxyDialog(app, r, { onDone = null, onClose = null } = {}) {   // onClose('done' | 'cancelled'): a caller outside the card (B-acb9)
  let sh = null;   // B-acb9: this call's form, or the live one a raise hands back — 'done' only after one of ITS own saves
  const label = String((r && (r.label || r.id)) || '');
  let field = null;
  const shell = createModalShell({ id: 'browser-proxy-dialog', key: String(r.id), opener: 'person', title: t('Proxy of {label}', { label }), dialogClass: 'bwho-dialog bproxy-dialog', onClose: () => { try { onClose?.(sh && SAVED.has(sh.overlay) ? 'done' : 'cancelled'); } catch { /* the caller's own */ } },
    unsaved: { isDirty: () => !!field && field.isDirty(), save: () => doSave() }, kind: 'form' });
  sh = shell;
  if (shell.raised) return shell;
  // 主开发 18:36Z: ANSWERABLE WHERE IT APPEARS — the note offers the move itself (one press; the row's menu item stays)
  if (r.proxyPasswordInProfile) {
    const legacy = noteLine('bnew-hint bproxy-legacy', t('Its saved proxy address carries its password, which is never used. The press below moves that password into the vault in one step — the profile keeps the address and that login. Or give the address here and choose its login.'), { warn: true });
    const movePress = btn(t('Move the password to the vault'), () => doMove(), 'bproxy-move');
    shell.body.append(legacy, movePress);
  }
  field = mountProxyField(shell.body, { proxy: r.proxyPasswordInProfile ? '' : String(r.proxy || ''), credential: String(r.proxyCredential || ''), fetchJson });
  shell.body.appendChild(el('div', 'bnew-hint', t('Applied at the browser\'s next start.')));
  const refusal = noteLine('bwho-refusal bnew-refusal', '', { warn: true });
  refusal.style.display = 'none';
  // B-8b87 cure: a locked (or never set up) vault's refusal carries ITS press — Unlock… / Set up the vault…
  const door = btn('', () => { if (door.dataset.door === 'move') { doMove(); return; } try { (door.dataset.door === 'setup' ? showSetup : showUnlock)(); } catch { /* the vault's own window */ } }, 'bproxy-door');   // B-7aef: «move» = this profile's own move (主开发 r2686)
  door.style.display = 'none';
  const notes = el('div', 'bwho-notes'); notes.append(refusal, door);
  const say = (text, which = null) => { noteText(refusal, text || ''); refusal.style.display = text ? '' : 'none'; door.dataset.door = which || ''; door.textContent = which === 'setup' ? t('Set up the vault…') : which === 'move' ? t('Move the password to the vault') : t('Unlock…'); door.style.display = text && which ? '' : 'none'; };
  const footer = el('div', 'dialog-footer bwho-footer');
  const cancel = btn(t('Cancel'), () => shell.close(), 'bnew-cancel');
  const save = btn(t('Save'), () => doSave(), 'mounts-btn-primary bproxy-save');
  footer.append(cancel, save);
  shell.dialog.append(notes, footer);
  let busy = false;
  async function doMove() {
    if (busy) return;
    busy = true; save.disabled = true;
    try {
      const res = await fetchJson('/api/vault/proxy-logins/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: r.id }) });
      if (!res || res.error || res.ok === false) { say(proxyWords(res && res.code, t, '', { act: 'move', word: res && res.word }), proxyDoor(res && res.code, res && res.word)); return; }
      showToast(t('{label}\'s proxy password is in the vault now — the profile keeps the address alone', { label }), { duration: 6000 });
      SAVED.add(shell.overlay);
      shell.close();
      try { onDone?.(); } catch { /* the panel reloads on its own */ }
    } finally { busy = false; save.disabled = false; }
  }
  async function doSave() {
    if (busy) return;
    busy = true; save.disabled = true;
    try {
      const v = await field.read();
      if (!v.ok) { say(proxyWords(v.code, t, v.error, { act: 'save', word: v.word }), proxyDoor(v.code, v.word)); if (v.focus) v.focus.focus(); return; }
      const res = await fetchJson(`/api/browser/profiles/${encodeURIComponent(r.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxy: v.proxy || '', proxyCredential: v.proxyCredential || '' }) });
      if (!res || res.error) { say(proxyWords(res && res.code, t, res && res.error, { act: 'save', word: res && res.word }), proxyDoor(res && res.code, res && res.word)); return; }
      // the exit check (主开发 17:04Z): a kept exit belongs to the road it was kept for — this change forgot it, said in place
      const forgot = !!(res.changed && res.changed.exitForgotten);
      showToast((v.proxy ? t('{label} goes through its proxy from its next start', { label }) : t('{label} has no proxy from its next start', { label })) + (forgot ? ' — ' + t('its kept exit is forgotten (it belonged to the old proxy); check it again') : ''), { duration: 8000 });
      SAVED.add(shell.overlay);
      shell.close();
      try { onDone?.(); } catch { /* the panel reloads on its own */ }
    } finally { busy = false; save.disabled = false; }
  }
  shell.ready.then((s) => { if (s) setTimeout(() => { try { field.focus(); } catch { /* none */ } }, 0); });
  return shell;
}

/** B-7aef (主开发 r2863 / r2927): A PROXY's REFUSAL ON ANY PERSON's ROAD — said in the page's words (`act`: the act it refused, 'start' ·
 *  'move') with ITS press as the toast's action: «Move the password to the vault» aimed at the profile the hub's answer names
 *  (`profileId`, carried from the launch's own verdict), or the vault's Unlock… / Set up the vault…; never a path through a menu.
 *  `said`: a road's own whole sentence said first (the switch's outcome), the proxy's after it. A MOVE a locked vault refused: its
 *  Unlock… goes on into the move the person already pressed, once THIS page's unlock lands (one press — never a second move).
 *  The roads: the Agent browser panel's Restart and a kept browser's Resume (browser-trace-view.js), Browse yourself and the live
 *  view's Resume / Restart (browser-live-window.js), the For-you item's Restart (user-todos-actions.js), a switch to another backend
 *  (browser-switcher.js — its restart meets the refusal). Not a road: the chat card's Resume of the conversation's own throwaway
 *  browser (chat-renderers.js) — an ephemeral profile holds no saved proxy and cannot be moved, so its words stand alone. */
export function sayProxyRefusal(r, what, { act = 'start', said = '' } = {}) {
  const door = act === 'move' && r && r.code === 'not_written' ? 'move' : proxyDoor(r && r.code, r && r.word);   // a write that did not land: the vault holds the login, the profile is as it was — press again
  const id = r && typeof r.profileId === 'string' && r.profileId ? r.profileId : '';   // the refusal names its profile (an id)
  const moveId = door === 'move' ? id : '';
  const goesOn = act === 'move' && door === 'unlock' && !!id;
  const reason = proxyWords(r && r.code, t, '', { act, word: r && r.word, goesOn });
  showToast(said ? joinSentences(said, reason) : t('{what} — {reason}', { what, reason }), { type: 'error', duration: 9000, ...(door === 'move' ? (moveId ? { action: { label: t('Move the password to the vault'), run: () => moveProxyPassword(moveId) } } : {}) : goesOn ? { action: { label: t('Unlock…'), run: () => unlockThen(() => { if ((vaultFacts() || {}).state === 'unlocked') moveProxyPassword(id); }, { here: true }) } } : door ? { action: { label: door === 'setup' ? t('Set up the vault…') : t('Unlock…'), run: () => { try { (door === 'setup' ? showSetup : showUnlock)(); } catch { /* the vault's own window */ } } } } : {}) });
}
const MOVING = new Set();   // B-7aef r2927: one move at a time per profile on the toast roads — a second press while the first is out asks nothing
/** The press itself (主开发 r2686): the HUB moves the word — this page posts the profile's id ONLY (the word crosses no page, address
 *  or log); a refused move is said with its own press (a locked vault: Unlock…, and the move goes on). The panels redraw on the hub's
 *  `browser-profiles-updated` (the keeper's move notifies). */
export async function moveProxyPassword(profileId) {
  const id = String(profileId || '');
  if (MOVING.has(id)) return false;
  MOVING.add(id);
  try {
    const res = await fetchJson('/api/vault/proxy-logins/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: id }) });
    if (!res || res.error || res.ok === false) { sayProxyRefusal(res && { ...res, profileId: id }, t('Could not move the password'), { act: 'move' }); return false; }
    showToast(t('The proxy password is in the vault now — the profile keeps the address alone'), { duration: 6000 });
    return true;
  } finally { MOVING.delete(id); }
}
