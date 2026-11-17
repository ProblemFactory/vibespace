// «Proxy…» — a browser profile card's proxy and its login (B-8b87, lane cli-update-needs-nothing). The person's edit: the address
// alone, its login from the vault (src/lib/browser-proxy-field.js); applied at the browser's next start (PATCH, a person's — an
// agent's token is refused by the route).
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';
import { mountProxyField } from './browser-proxy-field.js';
import { proxyWords, proxyDoor } from './browser-proxy-model.js';
import { showUnlock, showSetup } from './vault-unlock.js';

export function openProxyDialog(app, r, { onDone = null } = {}) {
  const label = String((r && (r.label || r.id)) || '');
  let field = null;
  const shell = createModalShell({ id: 'browser-proxy-dialog', key: String(r.id), opener: 'person', title: t('Proxy of {label}', { label }), dialogClass: 'bwho-dialog bproxy-dialog', onClose: () => { },
    unsaved: { isDirty: () => !!field && field.isDirty(), save: () => doSave() }, kind: 'form' });
  if (shell.raised) return shell;
  if (r.proxyPasswordInProfile) shell.body.appendChild(noteLine('bnew-hint bproxy-legacy', t('Its saved proxy address carries its password, which is never used. «Move the password to the vault» in ⋯ keeps it in one press — or give the address here and choose its login.'), { warn: true }));
  field = mountProxyField(shell.body, { proxy: r.proxyPasswordInProfile ? '' : String(r.proxy || ''), credential: String(r.proxyCredential || ''), fetchJson });
  shell.body.appendChild(el('div', 'bnew-hint', t('Applied at the browser\'s next start.')));
  const refusal = noteLine('bwho-refusal bnew-refusal', '', { warn: true });
  refusal.style.display = 'none';
  // B-8b87 cure: a locked (or never set up) vault's refusal carries ITS press — Unlock… / Set up the vault…
  const door = btn('', () => { try { (door.dataset.door === 'setup' ? showSetup : showUnlock)(); } catch { /* the vault's own window */ } }, 'bproxy-door');
  door.style.display = 'none';
  const notes = el('div', 'bwho-notes'); notes.append(refusal, door);
  const say = (text, which = null) => { noteText(refusal, text || ''); refusal.style.display = text ? '' : 'none'; door.dataset.door = which || ''; door.textContent = which === 'setup' ? t('Set up the vault…') : t('Unlock…'); door.style.display = text && which ? '' : 'none'; };
  const footer = el('div', 'dialog-footer bwho-footer');
  const cancel = btn(t('Cancel'), () => shell.close(), 'bnew-cancel');
  const save = btn(t('Save'), () => doSave(), 'mounts-btn-primary bproxy-save');
  footer.append(cancel, save);
  shell.dialog.append(notes, footer);
  let busy = false;
  async function doSave() {
    if (busy) return;
    busy = true; save.disabled = true;
    try {
      const v = await field.read();
      if (!v.ok) { say(proxyWords(v.code, t, v.error, { act: 'save', word: v.word }), proxyDoor(v.code, v.word)); if (v.focus) v.focus.focus(); return; }
      const res = await fetchJson(`/api/browser/profiles/${encodeURIComponent(r.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxy: v.proxy || '', proxyCredential: v.proxyCredential || '' }) });
      if (!res || res.error) { say(proxyWords(res && res.code, t, res && res.error, { act: 'save', word: res && res.word }), proxyDoor(res && res.code, res && res.word)); return; }
      showToast(v.proxy ? t('{label} goes through its proxy from its next start', { label }) : t('{label} has no proxy from its next start', { label }), { duration: 6000 });
      shell.close();
      try { onDone?.(); } catch { /* the panel reloads on its own */ }
    } finally { busy = false; save.disabled = false; }
  }
  shell.ready.then((s) => { if (s) setTimeout(() => { try { field.focus(); } catch { /* none */ } }, 0); });
  return shell;
}
