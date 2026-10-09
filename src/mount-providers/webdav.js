// src/mount-providers/webdav.js — a WebDAV server (Nextcloud or other): user + pass or a bearer token.
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through tr()

module.exports = {
  id: 'webdav',
  dirCache: { ttl: '30s' },   // no ChangeNotify in rclone for this backend: a listing is re-read when 30 s old (no poll flag)
  label: (m) => m.url,
  config(m, out, dec, x) {
    Object.assign(out, { url: m.url, vendor: m.vendor, user: m.user, pass: dec(m.passEnc), bearerToken: dec(m.bearerTokenEnc) });
  },
  create(m, cfg, x) {
    for (const k of ['url']) if (!cfg[k]) throw new Error(`${k} required`);
    if (!cfg.bearerToken && !cfg.user) throw new Error('user/pass or bearerToken required');
    Object.assign(m, {
      url: String(cfg.url), vendor: cfg.vendor === 'nextcloud' ? 'nextcloud' : 'other',
      user: cfg.user ? String(cfg.user) : null,
      passEnc: cfg.pass ? x._enc(cfg.pass) : null,
      bearerTokenEnc: cfg.bearerToken ? x._enc(cfg.bearerToken) : null,
    });
  },
  update(m, patch, setIf, x) {
    setIf('url', (v) => String(v).replace(/\/+$/, ''));
    setIf('vendor', (v) => (v === 'nextcloud' ? 'nextcloud' : 'other'));
    setIf('user');
    if (patch.pass) m.passEnc = x._enc(String(patch.pass));
    if (patch.bearerToken) m.bearerTokenEnc = x._enc(String(patch.bearerToken));
  },
  rclone(m, env, P, R, x) {
    env[P('TYPE')] = 'webdav';
    env[P('URL')] = this.davUrl ? this.davUrl(m) : m.url;
    env[P('VENDOR')] = m.vendor === 'nextcloud' ? 'nextcloud' : 'other';
    if (m.user) env[P('USER')] = m.user;
    if (m.passEnc) env[P('PASS')] = x._obscure(x._dec(m.passEnc));
    if (m.bearerTokenEnc) env[P('BEARER_TOKEN')] = x._dec(m.bearerTokenEnc);
    return `${R}:`;
  },
  // the CLIENT cells (lane dc-mount-client): pure data GET /api/mounts publishes once (`providers`); src/lib/sidebar-mounts.js
  // renders the sidebar row, the Connect / submount / Edit dialogs and the re-authorize words from them — it names no provider
  client: {
    pick: 6, form: 6, pickLabel: 'Nextcloud / WebDAV', tag: 'WebDAV',
    edit: [
      { key: 'url', label: 'URL', placeholder: 'https://…' },
      { key: 'vendor', label: i18nKey('Vendor'), default: 'other', type: 'select', options: [['other', i18nKey('Generic WebDAV')], ['nextcloud', 'Nextcloud']] },
      { key: 'user', label: i18nKey('User') },
      { key: 'pass', label: i18nKey('Password') },
      { key: 'bearerToken', label: i18nKey('Bearer token') },
    ],
    connect: [
      { key: 'url', label: i18nKey('WebDAV URL'), placeholder: 'https://cloud.example.com/remote.php/dav/files/me', hint: i18nKey('Nextcloud: Settings → Files shows this address. Use an app password if you have 2FA.') },
      { key: 'vendor', label: i18nKey('Vendor'), type: 'select', options: [['other', i18nKey('Generic WebDAV')], ['nextcloud', 'Nextcloud']] },
      { key: 'user', label: i18nKey('Username') },
      { key: 'pass', label: i18nKey('Password / app token'), type: 'password' },
    ],
  },
};
