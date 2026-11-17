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
/** The words a refusal is said in, by its CODE (the server's sentence only when the code has none here). */
export function proxyWords(code, t, error = '') {
  switch (code) {
    case 'bad_proxy': return t('The proxy must be http://host:port, https://host:port or socks5://host:port.');
    case 'bad_proxy_inline_credential': return t('A proxy\'s user name and password go in the vault — give the address alone, then choose its login below.');
    case 'bad_proxy_credential': return t('That login was saved for another proxy — choose this proxy\'s login, or make a new one.');
    case 'vault_locked': return t('The vault is locked — unlock it in the Vault window, then save.');
    case 'proxy_off_machine': return t('A browser profile\'s proxy works for browsers on this machine only, for now.');
    case 'login_needs': return t('A new login needs its user name and its password.');
    case 'nothing_to_move': return t('This profile\'s proxy carries no password.');
    default: return error ? String(error) : t('The proxy could not be saved.');
  }
}
