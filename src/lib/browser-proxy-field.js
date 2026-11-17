// THE PROXY FIELD of a browser profile (B-8b87, lane cli-update-needs-nothing) — the New profile dialog's and the card's «Proxy…»:
// the address alone, and its login chosen from the vault (or a new one saved INTO the vault from here — the password goes to the
// vault's own route at once, never into the profile). PURE rules: src/lib/browser-proxy-model.js.
import { t } from './i18n.js';
import { el } from './channel-chrome.js';
import { proxyAddressOf, loginsFor, loginNameParts, userNameFits } from './browser-proxy-model.js';

const NEW = '__new';
/** → { el, read(): Promise<{ ok, proxy, proxyCredential } | { ok: false, code, error?, focus? }>, focus() } */
export function mountProxyField(container, { proxy = '', credential = '', fetchJson } = {}) {
  const wrap = el('div', 'bnew-section bproxy-field');
  const addrRow = el('label', 'bnew-field');
  addrRow.appendChild(el('span', 'bnew-field-head', t('Proxy')));
  const addr = document.createElement('input');
  addr.type = 'text'; addr.className = 'bproxy-address'; addr.placeholder = 'socks5://host:1080'; addr.value = String(proxy || '');
  addr.autocomplete = 'off'; addr.spellcheck = false; addr.setAttribute('aria-label', t('Proxy'));
  addrRow.appendChild(addr);
  const hint = el('div', 'bnew-hint bproxy-hint', t('http, https or socks5 — the address alone; its login is kept in the vault. Empty: no proxy.'));
  const loginRow = el('label', 'bnew-field bproxy-login-row');
  loginRow.appendChild(el('span', 'bnew-field-head', t('Proxy login')));
  const sel = document.createElement('select');
  sel.className = 'bproxy-login'; sel.setAttribute('aria-label', t('Proxy login'));
  loginRow.appendChild(sel);
  const newRows = el('div', 'bproxy-new');
  const user = document.createElement('input');
  user.type = 'text'; user.className = 'bproxy-user'; user.placeholder = t('User name'); user.autocomplete = 'off'; user.setAttribute('aria-label', t('User name'));
  const pass = document.createElement('input');
  pass.type = 'password'; pass.className = 'bproxy-pass'; pass.placeholder = t('Password'); pass.autocomplete = 'new-password'; pass.setAttribute('aria-label', t('Password'));
  newRows.append(user, pass, el('div', 'bnew-hint', t('Saved in the vault as this proxy\'s login — the browser never sees it.')));
  wrap.append(addrRow, hint, loginRow, newRows);
  container.appendChild(wrap);
  let logins = [], want = String(credential || ''), loaded = null;   // B-8b87 cure: null = the vault's list asked · true = read · false = unreadable
  const initial = { addr: String(proxy || '').trim(), login: String(credential || '') };
  const kept = loginNameParts(initial.login);
  const draw = () => {
    const a = proxyAddressOf(addr.value);
    const keep = sel.value || want;
    sel.textContent = '';
    const opt = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; sel.appendChild(o); return o; };
    opt('', t('No login'));
    const list = loginsFor(logins, a.ok ? a.value : null);
    for (const l of list) opt(l.name, String(l.user));
    // B-8b87 cure: the profile's login the vault does not list (deleted, or the list unreadable) shown AS ITSELF — never «No login»
    if (kept && a.ok && a.value === kept.origin && !list.some((l) => l.name === initial.login)) opt(initial.login, loaded === false ? t('{user} — the vault\'s list could not be read', { user: kept.user }) : loaded ? t('{user} — no longer in the vault', { user: kept.user }) : kept.user);
    opt(NEW, t('New login…'));
    sel.value = [...sel.options].some((o) => o.value === keep) ? keep : '';
    loginRow.style.display = a.ok && a.value ? '' : 'none';
    newRows.style.display = a.ok && a.value && sel.value === NEW ? '' : 'none';
  };
  draw();
  Promise.resolve(typeof fetchJson === 'function' ? fetchJson('/api/vault/proxy-logins') : null).then((r) => { if (r && Array.isArray(r.logins)) { logins = r.logins; loaded = true; } else loaded = false; draw(); }, () => { loaded = false; draw(); });
  addr.addEventListener('input', draw);
  sel.addEventListener('change', () => { want = sel.value === NEW ? want : sel.value; draw(); if (sel.value === NEW) setTimeout(() => { try { user.focus(); } catch { /* none */ } }, 0); });
  async function read() {
    const a = proxyAddressOf(addr.value);
    if (!a.ok) return { ok: false, code: a.code, focus: addr };
    if (!a.value) return { ok: true, proxy: null, proxyCredential: null };
    if (sel.value !== NEW) return { ok: true, proxy: a.value, proxyCredential: sel.value || null };
    const u = user.value.trim();
    if (!u || !pass.value) return { ok: false, code: 'login_needs', focus: u ? pass : user };
    if (!userNameFits(u)) return { ok: false, code: 'login_user_unusable', focus: user };   // B-8b87 cure: refused at the field, nothing sent
    const r = await fetchJson('/api/vault/proxy-logins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxy: a.value, user: u, proxyPassword: pass.value }) });
    if (!r || r.ok === false || r.error) return { ok: false, code: (r && r.code) || 'not_written', word: (r && r.word) || '', error: r && r.error, focus: pass };
    pass.value = '';   // the password is the vault's now — never left in the page
    logins = [...logins.filter((l) => l.name !== r.name), { name: r.name, origin: a.value, user: u }];
    want = r.name; draw();
    return { ok: true, proxy: a.value, proxyCredential: r.name };
  }
  /** a change the person made (the address, the login, a new login typed) — the dialog's unsaved guard */
  // B-8b87 cure: the login counts as changed only once the vault's list has answered (before it, the select holds no saved login)
  const isDirty = () => addr.value.trim() !== initial.addr || (loaded !== null && loginRow.style.display !== 'none' && (sel.value === NEW || (sel.value || '') !== initial.login)) || !!user.value || !!pass.value;
  return { el: wrap, read, focus: () => addr.focus(), isDirty };
}
