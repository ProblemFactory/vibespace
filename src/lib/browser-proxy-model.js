// A BROWSER PROFILE'S PROXY, AS THE PERSON TYPES IT (B-8b87, lane cli-update-needs-nothing). PURE — the client's mirror of
// src/browser-profiles.js normalizeProxy (the server judges again, and its word wins): the address alone (`scheme://host:port` for
// http, https or socks5), its login a vault entry `proxy-login:<scheme>://<host>:<port>#<user>` saved for THAT proxy.
const SCHEMES = Object.freeze(['http', 'https', 'socks5']);
const DEFAULT_PORT = Object.freeze({ http: 80, https: 443, socks5: 1080 });
const ADDR_RE = /^(https?|socks4a?|socks5h?):\/\/(?:([^@/\s]+)@)?([A-Za-z0-9.\-_]+|\[[0-9A-Fa-f:.]+\])(?::(\d{1,5}))?\/?$/;

/** The address typed → { ok: true, value: 'scheme://host:port' | null } | { ok: false, code } (the server's codes). */
export function proxyAddressOf(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return { ok: true, value: null };
  const m = ADDR_RE.exec(s);
  if (!m) return { ok: false, code: 'bad_proxy' };
  if (m[2]) return { ok: false, code: 'bad_proxy_inline_credential' };
  const scheme = m[1] === 'socks5h' ? 'socks5' : m[1];
  if (!SCHEMES.includes(scheme)) return { ok: false, code: 'bad_proxy' };
  const port = m[4] ? Number(m[4]) : DEFAULT_PORT[scheme];
  if (!(port >= 1 && port <= 65535)) return { ok: false, code: 'bad_proxy' };
  const host = m[3].replace(/^\[|\]$/g, '').toLowerCase();
  return { ok: true, value: `${scheme}://${host.includes(':') ? `[${host}]` : host}:${port}` };
}
/** The vault's saved logins (GET /api/vault/proxy-logins — names only) for ONE address: a login is never offered for another proxy. */
export function loginsFor(logins, address) {
  if (!address) return [];
  return (Array.isArray(logins) ? logins : []).filter((l) => l && l.origin === address && l.name).sort((a, b) => String(a.user).localeCompare(String(b.user)));
}
/** A vault entry's name → { origin, user } (null when it is not a proxy login's name) — the field shows a login the vault no longer
 *  lists AS ITSELF (B-8b87 cure), never as «No login». */
export function loginNameParts(name) {
  const m = /^proxy-login:((?:https?|socks5):\/\/[^#\s]+)#([^\s#]{1,128})$/.exec(String(name || ''));
  return m ? { origin: m[1], user: m[2] } : null;
}
/** a user name the vault entry's name can carry (= src/browser-profiles.js PROXY_LOGIN_RE's user part) */
export const userNameFits = (u) => !!u && u.length <= 128 && !/[\s#\u0000-\u001f\u007f]/.test(u);
/** The refusals a person's page says by these words (the start's, the edit's, the creation's — never the server's English). */
export const PROXY_REFUSALS = Object.freeze(['proxy_cloud_browser', 'proxy_off_machine', 'bad_proxy_credential', 'proxy_unusable', 'proxy_password_in_profile', 'proxy_scheme_unsupported', 'proxy_external_browser', 'egress_proxy_missing', 'proxy_credential_unreadable']);
/** The press a refusal needs, by its code and the vault's word: 'unlock' (Unlock…) | 'setup' (Set up the vault…) | null */
export function proxyDoor(code, word = '') {
  const w = String(word || '');
  if (code === 'vault_locked' || /vault_locked/.test(w)) return 'unlock';
  if (code === 'vault_not_set_up' || /vault_not_set_up/.test(w)) return 'setup';
  if (code === 'proxy_password_in_profile') return 'move';   // B-7aef (主开发 r2686): the profile's own «Move the password to the vault» — the hub moves the word, it never crosses the page
  return null;
}
/** The words a refusal is said in, by its CODE and the act it refused (`act`: 'save' — this dialog's Save · 'move' — «Move the
 *  password to the vault» · 'start' — a start of the browser) and the vault's own word. B-8b87 cure: a code with no words here is
 *  named by its code in the page's language — never the server's English sentence. */
export function proxyWords(code, t, error = '', { act = 'save', word = '' } = {}) {
  const door = proxyDoor(code, word);
  if (door === 'unlock') return act === 'move' ? t('The vault is locked — press Unlock…, then move the password again.') : act === 'start' ? t('The vault is locked — press Unlock…, then start the browser again.') : t('The vault is locked — press Unlock…, then save.');
  if (door === 'setup') return t('The vault is not set up yet — press Set up the vault…, then try again.');
  switch (code) {
    case 'bad_proxy': return t('The proxy must be http://host:port, https://host:port or socks5://host:port.');
    case 'bad_proxy_inline_credential': return t('A proxy\'s user name and password go in the vault — give the address alone, then choose its login below.');
    case 'bad_proxy_credential': return t('That login was saved for another proxy — choose this proxy\'s login, or make a new one.');
    case 'proxy_off_machine': return t('A browser profile\'s proxy works for browsers on this machine only, for now.');
    case 'proxy_cloud_browser': return t('A cloud browser runs at its vendor, where a proxy on this machine cannot reach it — clear the proxy, or set one in the vendor\'s own settings.');
    case 'proxy_credential_unreadable': return /proxy_login_no_entry/.test(String(word || '')) ? t('Its proxy login is no longer in the vault — choose its login again in Proxy….') : t('Its proxy login could not be read from the vault ({code}).', { code: String(word || code) });
    case 'proxy_password_in_profile': return t('Its proxy address carries its password, which is never used — move it to the vault first.');   // its door: proxyDoor 'move'
    case 'proxy_scheme_unsupported': return t('Its proxy is socks4, which cannot carry a site\'s name — give an http, https or socks5 proxy in Proxy….');
    case 'proxy_external_browser': return t('This profile attaches to a browser VibeSpace does not start — that browser keeps its own proxy settings.');
    case 'egress_proxy_missing': return t('The browser\'s proxy could not be put in its config — the browser was not started without it.');
    case 'proxy_unusable': return t('Its proxy address cannot be read — give it again in Proxy….');
    case 'not_written': return act === 'move' ? t('The login is saved in the vault, but the profile could not be written — press «Move the password to the vault» again.') : t('The proxy could not be saved.');
    case 'login_needs': return t('A new login needs its user name and its password.');
    case 'proxy_user_unusable': return t('A login\'s user name cannot hold a space or #, and is at most 128 characters.');
    case 'nothing_to_move': return t('This profile\'s proxy carries no password.');
    default: return code ? t('The proxy could not be used ({code}).', { code: String(code) }) : t('server unreachable');
  }
}
