// «Check the exit…» — a browser profile's proxy EXIT (the owner 2026-11-17 «A就行»; the keeper's exitCheck / keepEgress). The person
// presses Check: the hub asks the owner's check address THROUGH this profile's own proxy and answers what it read — NOTHING is kept
// until the person presses Keep (each field editable). No check address set ⇒ the field is HERE (the same person writes the setting —
// https only, no login, no private literal); «Type it by hand» always beside it. Never a timer, never at a launch.
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';

const KEY = 'browser.exitCheckUrl';
const post = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const WORDS = (code, error) => {
  switch (code) {
    case 'exit_no_proxy': return t('This profile has no proxy of its own — its browser may leave by another road, so a check here could state an exit it does not use. Type the exit by hand if a plugin needs it.');
    case 'exit_url_unset': return t('No exit check address is set — give one below (an https address you trust), or type the exit by hand.');
    case 'exit_url_invalid': return t('The exit check address must be a public https address with no user name or password in it.');
    case 'exit_restart_first': return t('This browser runs without this proxy — restart it, then check the exit.');
    case 'proxy_credential_unreadable': return t('The proxy\'s login is in the vault, which is locked — a person unlocks it on this instance\'s page (Unlock…), then checks again.');
    case 'exit_timezone_invalid': return t('That is not a time zone — give a zone name like Asia/Shanghai.');
    case 'exit_empty': return t('Give at least a country or a time zone.');
    case 'exit_check_timeout': return t('The exit check address did not answer in 8 seconds.');
    default: return error ? String(error) : t('The exit could not be checked.');
  }
};

export function openExitDialog(app, r, { onDone = null } = {}) {
  const label = String((r && (r.label || r.id)) || '');
  let dirty = false;
  const shell = createModalShell({ id: 'browser-exit-dialog', key: String(r.id), opener: 'person', title: t('The exit of {label}', { label }), dialogClass: 'bwho-dialog bexit-dialog', onClose: () => { },
    unsaved: { isDirty: () => dirty, save: () => doKeep() }, kind: 'form' });
  if (shell.raised) return shell;
  const body = shell.body;
  body.appendChild(el('div', 'bnew-hint', t('Checked only when you press Check — through this profile\'s own proxy, at the exit check address. Nothing is kept until you press Keep; an engine plugin reads what you keep when the browser starts.')));
  const kept = r.egress && typeof r.egress === 'object' ? r.egress : null;
  if (kept) body.appendChild(el('div', 'bnew-hint bexit-kept', t('Kept: {ip} · {country} · {timezone} ({how})', { ip: kept.publicIp || '—', country: kept.country || '—', timezone: kept.timezone || '—', how: kept.source === 'measured' ? t('measured') : t('typed') })));
  // the check address — shown here when none is set (the person at this dialog may set it)
  const urlRow = el('label', 'bnew-field bexit-url-row');
  urlRow.appendChild(el('span', 'bnew-field-head', t('Exit check address')));
  const urlIn = document.createElement('input');
  urlIn.type = 'text'; urlIn.className = 'bexit-url'; urlIn.placeholder = 'https://…'; urlIn.autocomplete = 'off'; urlIn.spellcheck = false; urlIn.setAttribute('aria-label', t('Exit check address'));
  urlRow.appendChild(urlIn);
  const current = (() => { try { return String((app && app.settings && app.settings.get && app.settings.get(KEY)) || ''); } catch { return ''; } })();
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
  const notes = el('div', 'bwho-notes'); notes.appendChild(refusal);
  const say = (text) => { noteText(refusal, text || ''); refusal.style.display = text ? '' : 'none'; };
  const footer = el('div', 'dialog-footer bwho-footer');
  const cancel = btn(t('Cancel'), () => shell.close(), 'bnew-cancel');
  const byHand = btn(t('Type it by hand'), () => { source = 'typed'; read = null; fields.style.display = ''; keep.style.display = ''; say(''); try { countryInput.focus(); } catch { /* none */ } }, 'bexit-hand');
  const check = btn(t('Check'), () => doCheck(), 'mounts-btn-primary bexit-check');
  const keep = btn(t('Keep'), () => doKeep(), 'mounts-btn-primary bexit-keep');
  keep.style.display = 'none';
  footer.append(cancel, byHand, check, keep);
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
        if (!w || w.error) { say(WORDS((w && w.code) || 'exit_url_invalid', w && w.error)); urlIn.focus(); return; }
        urlRow.style.display = 'none';
      }
      const res = await post(`/api/browser/profiles/${encodeURIComponent(r.id)}/exit-check`);
      if (!res || !res.ok) {
        if (res && res.code === 'exit_url_unset') urlRow.style.display = '';
        say(res && res.code === 'exit_answer_unreadable' ? t('The answer could not be read: {what}. Type the exit by hand, or set another address.', { what: String(res.error || res.kind || '') }) : WORDS(res && res.code, res && res.error));
        return;
      }
      read = res.read; source = 'measured';
      ipInput.value = read.publicIp || ''; countryInput.value = read.country || ''; zoneInput.value = read.timezone || '';
      fields.style.display = ''; keep.style.display = '';
      say(t('Read — check each field, then Keep.'));
    } finally { busy = false; check.disabled = false; }
  }
  async function doKeep() {
    if (busy) return;
    const edited = read && (ipInput.value.trim() !== (read.publicIp || '') || countryInput.value.trim() !== (read.country || '') || zoneInput.value.trim() !== (read.timezone || ''));
    const res = await post(`/api/browser/profiles/${encodeURIComponent(r.id)}/egress`, { publicIp: ipInput.value.trim(), country: countryInput.value.trim(), timezone: zoneInput.value.trim(), source: source === 'measured' && !edited ? 'measured' : 'typed' });
    if (!res || !res.ok) { say(WORDS(res && res.code, res && res.error)); if (res && res.code === 'exit_timezone_invalid') zoneInput.focus(); return; }
    dirty = false;
    showToast(t('{label}\'s exit is kept — an engine plugin reads it when the browser starts', { label }), { duration: 6000 });
    shell.close();
    try { onDone?.(); } catch { /* the panel reloads on its own */ }
  }
  shell.ready.then((s) => { if (s) setTimeout(() => { try { (urlRow.style.display !== 'none' ? urlIn : check).focus(); } catch { /* none */ } }, 0); });
  return shell;
}
