// lane login-request-card — ONE LOGIN, SEVERAL SITES (the owner 2026-11-17; step F's last part, the login request card B-a681):
// THE WORDS BEFORE THE PRESS when a login request is answered with a login already saved («Use a login you already saved…»).
// PURE: the hub's siteWordsFor answer (GET /api/vault/web-logins/site-words — the exact address, its ASCII form, a look-alike,
// and BY NAME who may then have the login filled there) + the card's facts → the sentences, through the page's own `t`, handed in.
// The module imports nothing, so a fast suite reads it as it is.

/** `w` = the hub's answer (or a refusal); `site` = the request's site; `login` = the picked login as the picker drew it (site · user);
 *  `t` = the page's translator. → [sentence, …] (the first always says what the press does).
 *  THE VAULT'S LAW (主开发 12:17Z, the use door's must): a change that WIDENS who may use a login is said BY NAME before the press —
 *  every principal of the hub's answer is said, none dropped: its name (the hub reads it as the Vault window's chips do), else a
 *  Task Group by its id, a conversation not running now by its key. */
export function useLoginWords(w, { site = '', login = '', t }) {
  const ok = !!w && w.ok !== false;
  const out = [ok && w.there
    ? t('{site} is one of this login\'s sites already — it signs in there as {user}; the press changes only who may have it filled.', { site, user: String(w.there) })
    : t('Adds {site} to the login {login} — it is filled there with that login\'s one password; nothing is typed again.', { site, login })];
  if (!ok) {
    out.push(t('What it changes could not be read ({code}) — the press says why.', { code: String((w && w.code) || 'error') }));
    return out;
  }
  if (!w.there && w.user) out.push(t('It signs in there as {user}.', { user: String(w.user) }));
  if (w.unicode && w.ascii) out.push(t('The address is {unicode} — written {ascii} in plain letters.', { unicode: w.unicode, ascii: w.ascii }));
  if (w.lookalike && w.lookalike.domain) {
    out.push(t('Careful: {domain} is not the domain of this login\'s other sites ({mine}).', { domain: w.lookalike.domain, mine: (w.lookalike.loginDomains || []).join(', ') }));
  }
  const wd = w.widens || {};
  const idOf = (p) => (p && p.kind === 'everyone' ? 'everyone' : p && p.kind === 'group' ? `group:${p.id}` : `${(p && p.kind) || '?'}:${(p && (p.key || p.id)) || ''}`);
  const nameOf = (p) => {
    if (p && p.kind === 'everyone') return t('every conversation');
    const n = p && typeof p.name === 'string' ? p.name.trim() : '';
    if (n) return n;
    if (p && p.kind === 'group') return `${t('Task group')} ${String(p.id || '?')}`;
    return t('a conversation not running now ({key})', { key: String((p && (p.key || p.id)) || '?') });
  };
  const seen = new Set(), names = [];
  for (const p of [...(wd.login || []), ...(wd.anyAccount || []), ...(wd.anySite || [])]) { if (!p || typeof p !== 'object') continue; const k = idOf(p); if (seen.has(k)) continue; seen.add(k); names.push(nameOf(p)); }
  if (wd.owner) names.unshift(t('the conversation that saved it ({key})', { key: String(wd.ownerName || wd.owner) }));
  out.push(names.length
    ? t('Then it may be filled on {site} by: {names}.', { site, names: names.join(', ') })
    : t('Nobody else may have it filled on {site} yet.', { site }));
  return out;
}

/** THE GRANT PICKER'S OWN ROW (主开发 10:54Z, as if a must): with a login's added sites in the list, `entry.grants` holds rows of
 *  OTHER sites too (an added site's own row, its «any account on this site»). The picker writes at the login's FIRST site
 *  (`<origin>#<user>`, `<origin>#*`, `*`), so it reads exactly that row — never another site's row of the same scope. → row | null */
export function ownRowOf(entry, scope) {
  const e = entry || {};
  const want = scope === 'this-account' ? `${e.origin}#${e.user}` : scope === 'any-account' ? `${e.origin}#*` : scope === 'any-site' ? '*' : null;
  return want ? ((e.grants || []).find((g) => g && !g.unknown && g.scope === scope && g.resource === want) || null) : null;
}
/** A chip's site words: the host of a row that belongs to another site than the login's first (null for the first site and for
 *  «any site»), so a chip on an added site says where it lets the login be filled. */
export function chipSiteOf(entry, g) {
  const e = entry || {};
  if (!g || !g.site || g.site === e.origin) return null;
  return String(g.site).replace(/^https?:\/\//, '');
}
