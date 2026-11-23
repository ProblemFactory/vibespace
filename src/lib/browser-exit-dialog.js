// «Check the exit…» — a browser profile's proxy EXIT (the owner 2026-11-17 «A就行»; the keeper's exitCheck / keepEgress). The person
// presses Check: the hub asks the owner's check address THROUGH this profile's own proxy and answers what it read — NOTHING is kept
// until the person presses Keep (each field editable). No check address set ⇒ the field is HERE (the same person writes the setting —
// https only, no login, no private literal); «Type it by hand» always beside it. Never a timer, never at a launch.
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';
import { exitSay, exitAgeText, exitWords } from './browser-exit-words.js';
import { proxyWords, proxyDoor } from './browser-proxy-model.js';   // B-7aef: the move's own refusal words and press (a locked vault: unlock, then move again)
import { showUnlock, showSetup } from './vault-unlock.js';   // B-7aef (主开发 r2863): the vault's own press, the proxy dialog's door

const KEY = 'browser.exitCheckUrl';
const post = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
// 主开发 18:36Z: every sentence a person reads here is the PAGE's, chosen by code or kind (src/lib/browser-exit-words.js); what the far
// side said rides after it as data, never as the sentence
const WORDS = (code, extra = {}) => exitSay(code, t, extra);
const DOOR = (code) => (code ? exitWords(code, t).door || null : null);   // B-7aef: a refusal's door, as exitWords answers it

// B-acb9 (r226): the forms ONE of their own saves ended, keyed by the form's overlay. A second open of the same profile RAISES the
// live form and hands its caller that same overlay, so the word every caller hears is the FORM's — never one call's local.
const SAVED = new WeakSet();
export function openExitDialog(app, r, { onDone = null, onClose = null } = {}) {   // onClose('done' | 'cancelled'): a caller outside the card (B-acb9)
  let sh = null;   // B-acb9: this call's form, or the live one a raise hands back — 'done' only after one of ITS own saves
  const label = String((r && (r.label || r.id)) || '');
  let dirty = false;
  const shell = createModalShell({ id: 'browser-exit-dialog', key: String(r.id), opener: 'person', title: t('The exit of {label}', { label }), dialogClass: 'bwho-dialog bexit-dialog', onClose: () => { try { onClose?.(sh && SAVED.has(sh.overlay) ? 'done' : 'cancelled'); } catch { /* the caller's own */ } },
    unsaved: { isDirty: () => dirty, save: () => doKeep() }, kind: 'form' });
  sh = shell;
  if (shell.raised) return shell;
  const body = shell.body;
  body.appendChild(el('div', 'bnew-hint', t('Checked only when you press Check — through this profile\'s own proxy, at the exit check address. Nothing is kept until you press Keep; an engine plugin reads what you keep when the browser starts.')));
  const kept = r.egress && typeof r.egress === 'object' ? r.egress : null;
  if (kept) body.appendChild(el('div', 'bnew-hint bexit-kept', t('Kept: {ip} · {country} · {timezone} ({how}, checked {age})', { ip: kept.publicIp || '—', country: kept.country || '—', timezone: kept.timezone || '—', how: kept.source === 'measured' ? t('measured') : t('typed'), age: kept.checkedAt ? exitAgeText(Date.now() - Number(kept.checkedAt), t) : '—' })));
  // the check address — shown here when none is set (the person at this dialog may set it)
  const urlRow = el('label', 'bnew-field bexit-url-row');
  urlRow.appendChild(el('span', 'bnew-field-head', t('Exit check address')));
  const urlIn = document.createElement('input');
  urlIn.type = 'text'; urlIn.className = 'bexit-url'; urlIn.placeholder = 'https://…'; urlIn.autocomplete = 'off'; urlIn.spellcheck = false; urlIn.setAttribute('aria-label', t('Exit check address'));
  urlRow.appendChild(urlIn);
  // the address IN USE is the STORED one (a value this page typed and the server set aside is not in use) — 主开发 17:56Z
  const current = (() => { try { const S = app && app.settings; return String((S && (typeof S.serverValue === 'function' ? S.serverValue(KEY) : S.get && S.get(KEY))) || ''); } catch { return ''; } })();
  urlRow.style.display = current ? 'none' : '';
  body.appendChild(urlRow);
  // the three facts — what was read (editable) or typed by hand
  const fields = el('div', 'bexit-fields');
  const mk = (cls, head, ph) => { const row = el('label', 'bnew-field'); row.appendChild(el('span', 'bnew-field-head', head)); const i = document.createElement('input'); i.type = 'text'; i.className = cls; i.placeholder = ph; i.autocomplete = 'off'; i.spellcheck = false; i.setAttribute('aria-label', head); i.addEventListener('input', () => { dirty = true; }); row.appendChild(i); fields.appendChild(row); return i; };
  const ipInput = mk('bexit-ip', t('Public address'), '203.0.113.7'), countryInput = mk('bexit-country', t('Country'), 'JP'), zoneInput = mk('bexit-tz', t('Time zone'), 'Asia/Tokyo');
  fields.style.display = 'none';
  body.appendChild(fields);
  const refusal = noteLine('bwho-refusal bnew-refusal', '', { warn: true });
  refusal.style.display = 'none';
  // B-7aef (主开发 r2686): «Move the password to the vault» beside the refusal that names it — this profile's own move (the hub moves the
  // word: it never crosses the page); a refused move says why and what to do; a done one takes the refusal away. r2863: a move a locked
  // (or never set up) vault refused takes THE SAME DOOR as the proxy dialog — Unlock… / Set up the vault… — with Move after it
  const vaultDoor = btn('', () => { try { (vaultDoor.dataset.door === 'setup' ? showSetup : showUnlock)(); } catch { /* the vault's own window */ } }, 'bexit-vault');
  vaultDoor.style.display = 'none';
  const moveDoor = btn(t('Move the password to the vault'), () => doMove(), 'bexit-door');
  moveDoor.style.display = 'none';
  const notes = el('div', 'bwho-notes'); notes.append(refusal, vaultDoor, moveDoor);
  const say = (text, door = null) => {
    noteText(refusal, text || ''); refusal.style.display = text ? '' : 'none';
    const vault = door === 'unlock' || door === 'setup';
    vaultDoor.dataset.door = vault ? door : ''; vaultDoor.textContent = door === 'setup' ? t('Set up the vault…') : t('Unlock…');
    vaultDoor.style.display = text && vault ? '' : 'none';
    moveDoor.style.display = text && (door === 'move' || vault) ? '' : 'none';
  };
  let moving = false;   // one move at a time: a second press while the first is out asks nothing (the press stays live — never greyed)
  async function doMove() {
    if (moving) return;
    moving = true;
    try {
      const res = await post('/api/vault/proxy-logins/move', { profileId: r.id });
      if (!res || res.error || res.ok === false) {
        // a locked (or never set up) vault refuses by name and says what to do (unlock, then move again) — its press first, Move after it
        // (主开发 r2686 law 2); a write that did not land keeps Move alone (the vault holds the login, the profile is as it was: press again)
        const door = res && res.code === 'not_written' ? 'move' : proxyDoor(res && res.code, res && res.word);
        say(proxyWords(res && res.code, t, '', { act: 'move', word: res && res.word }), door);
        return;
      }
      say('');
      showToast(t('The proxy password is in the vault now — the profile keeps the address alone'), { duration: 6000 });
    } finally { moving = false; }
  }
  const footer = el('div', 'dialog-footer bwho-footer');
  const cancel = btn(t('Cancel'), () => shell.close(), 'bnew-cancel');
  const byHand = btn(t('Type it by hand'), () => { source = 'typed'; read = null; fields.style.display = ''; keep.style.display = ''; say(''); try { countryInput.focus(); } catch { /* none */ } }, 'bexit-hand');
  const check = btn(t('Check'), () => doCheck(), 'mounts-btn-primary bexit-check');
  const keep = btn(t('Keep'), () => doKeep(), 'mounts-btn-primary bexit-keep');
  keep.style.display = 'none';
  // 主开发 17:04Z: a kept exit can be FORGOTTEN here (the keeper's clear) — never only by deleting the profile
  const forget = btn(t('Forget'), () => doForget(), 'bexit-forget');
  forget.style.display = kept ? '' : 'none';
  footer.append(cancel, forget, byHand, check, keep);
  shell.dialog.append(notes, footer);
  let source = 'typed', read = null, busy = false;
  async function doCheck() {
    if (busy) return;
    busy = true; check.disabled = true; say(t('Checking through this profile\'s proxy…'));
    try {
      if (urlRow.style.display !== 'none') {
        const u = urlIn.value.trim();
        if (!u) { say(WORDS('exit_url_unset')); urlIn.focus(); return; }
        const w = await fetchJson('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [KEY]: u }) });
        const refusedHere = w && w.refused && w.refused[KEY];   // the server sets a refused address aside and says why (the rest of a save lands)
        if (!w || w.error || refusedHere) { say(WORDS((refusedHere && refusedHere.code) || (w && w.code) || 'exit_url_invalid')); urlIn.focus(); return; }
        urlRow.style.display = 'none';
      }
      const res = await post(`/api/browser/profiles/${encodeURIComponent(r.id)}/exit-check`);
      if (!res || !res.ok) {
        if (res && res.code === 'exit_url_unset') urlRow.style.display = '';
        if (res && res.code === 'exit_answer_unreadable') { if (!urlIn.value) urlIn.value = current; urlRow.style.display = ''; }   // the door to change it: the field, here
        say(WORDS(res && res.code, { kind: res && res.kind, status: res && res.status, detail: res && res.detail }), DOOR(res && res.code));
        return;
      }
      read = res.read; source = 'measured';
      ipInput.value = read.publicIp || ''; countryInput.value = read.country || ''; zoneInput.value = read.timezone || '';
      fields.style.display = ''; keep.style.display = '';
      say(t('Read — check each field, then Keep.'));
    } finally { busy = false; check.disabled = false; }
  }
  async function doForget() {
    if (busy) return;
    const res = await post(`/api/browser/profiles/${encodeURIComponent(r.id)}/egress`, { clear: true });
    if (!res || !res.ok) { say(WORDS(res && res.code)); return; }
    dirty = false;
    showToast(t('{label}\'s kept exit is forgotten — an engine plugin gets none at the next start', { label }), { duration: 6000 });
    SAVED.add(shell.overlay);
    shell.close();
    try { onDone?.(); } catch { /* the panel reloads on its own */ }
  }
  async function doKeep() {
    if (busy) return;
    const edited = read && (ipInput.value.trim() !== (read.publicIp || '') || countryInput.value.trim() !== (read.country || '') || zoneInput.value.trim() !== (read.timezone || ''));
    const res = await post(`/api/browser/profiles/${encodeURIComponent(r.id)}/egress`, { publicIp: ipInput.value.trim(), country: countryInput.value.trim(), timezone: zoneInput.value.trim(), source: source === 'measured' && !edited ? 'measured' : 'typed' });
    if (!res || !res.ok) { say(WORDS(res && res.code)); if (res && res.code === 'exit_timezone_invalid') zoneInput.focus(); return; }
    dirty = false;
    showToast(t('{label}\'s exit is kept — an engine plugin reads it when the browser starts', { label }), { duration: 6000 });
    SAVED.add(shell.overlay);
    shell.close();
    try { onDone?.(); } catch { /* the panel reloads on its own */ }
  }
  shell.ready.then((s) => { if (s) setTimeout(() => { try { (urlRow.style.display !== 'none' ? urlIn : check).focus(); } catch { /* none */ } }, 0); });
  return shell;
}
