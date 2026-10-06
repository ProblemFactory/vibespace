// src/mount-providers/sftp.js — an SSH server over SFTP (a key file or a password).
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through tr()

const isAbs = (p) => String(p).startsWith('/');   // path.isAbsolute on POSIX — a PURE row requires nothing

module.exports = {
  id: 'sftp',
  label: (m) => `${m.sshUser}@${m.sshHost}:${m.sshPath || '~'}`,
  config(m, out, dec, x) {
    Object.assign(out, { sshHost: m.sshHost, sshUser: m.sshUser, sshPort: m.sshPort, sshPath: m.sshPath, keyPath: m.keyPath, pass: dec(m.passEnc) });
  },
  create(m, cfg, x) {
    for (const k of ['sshHost', 'sshUser']) if (!cfg[k]) throw new Error(`${k} required`);
    if (!cfg.keyPath && !cfg.pass) throw new Error('keyPath or pass required');
    if (cfg.keyPath && !isAbs(cfg.keyPath)) throw new Error('keyPath must be absolute');
    Object.assign(m, {
      sshHost: String(cfg.sshHost), sshUser: String(cfg.sshUser),
      sshPort: parseInt(cfg.sshPort) || 22,
      sshPath: String(cfg.sshPath || ''),
      keyPath: cfg.keyPath || null,
      passEnc: cfg.pass ? x._enc(cfg.pass) : null,
    });
  },
  child(m, cfg, p, x) {
    m.sshPath = String(cfg.sshPath || '');
  },
  updateChild(m, patch, setIf, x) {
    if (patch.sshPath !== undefined) m.sshPath = String(patch.sshPath || '');
  },
  update(m, patch, setIf, x) {
    setIf('sshHost'); setIf('sshUser');
    if (patch.sshPort) m.sshPort = parseInt(patch.sshPort) || 22;
    if (patch.sshPath !== undefined) m.sshPath = String(patch.sshPath || '');
    if (patch.keyPath) {
      if (!isAbs(String(patch.keyPath))) throw new Error('keyPath must be absolute');
      m.keyPath = String(patch.keyPath);
    }
    if (patch.pass) m.passEnc = x._enc(String(patch.pass));
  },
  rclone(m, env, P, R, x) {
    env[P('TYPE')] = 'sftp';
    env[P('HOST')] = m.sshHost;
    env[P('USER')] = m.sshUser;
    env[P('PORT')] = String(m.sshPort || 22);
    if (m.keyPath) env[P('KEY_FILE')] = m.keyPath;
    if (m.passEnc) env[P('PASS')] = x._obscure(x._dec(m.passEnc));
    return `${R}:${m.sshPath || ''}`;
  },
  // the CLIENT cells (lane dc-mount-client): pure data GET /api/mounts publishes once (`providers`); src/lib/sidebar-mounts.js
  // renders the sidebar row, the Connect / submount / Edit dialogs and the re-authorize words from them — it names no provider
  client: {
    offersChild: true,   // the sidebar row's ＋ (a submount under it)
    pick: 7, form: 7, pickLabel: i18nKey('A server over SSH (SFTP)'), tag: 'SFTP',
    widgets: ['host-prefill'],
    submit: { drop: ['fromHost'] },   // UI-only prefill helper
    child: { path: { key: 'sshPath', label: i18nKey('Remote path'), placeholder: '/data' } },
    edit: [
      { key: 'sshHost', label: i18nKey('Host'), placeholder: 'example.com' },
      { key: 'sshUser', label: i18nKey('User') },
      { key: 'sshPort', label: i18nKey('Port'), placeholder: '22' },
      { key: 'sshPath', label: i18nKey('Remote path (optional)'), placeholder: '/data' },
      { key: 'keyPath', label: i18nKey('Private key path (absolute, optional)'), placeholder: '/home/me/.ssh/id_ed25519' },
      { key: 'pass', label: i18nKey('Password') },
    ],
    editChild: [{ key: 'sshPath', label: i18nKey('Remote path'), placeholder: '/data' }],
    connect: [
      { key: 'fromHost', label: i18nKey('From registered host (optional)'), type: 'select',
        options: [['', i18nKey('— pick to prefill —')], ], hosts: true },
      { key: 'sshHost', label: i18nKey('SSH host'), placeholder: 'box.example.com' },
      { key: 'sshUser', label: i18nKey('SSH user'), placeholder: 'ubuntu' },
      { key: 'sshPort', label: i18nKey('Port'), placeholder: '22' },
      { key: 'sshPath', label: i18nKey('Remote path (optional)'), placeholder: '/home/ubuntu/data', autocomplete: { hostDir: 'fromHost' } },
      { key: 'keyPath', label: i18nKey('Private key path (absolute) — or use password'), placeholder: '~/.ssh/id_ed25519', autocomplete: 'local' },
      { key: 'pass', label: i18nKey('Password (if no key)'), type: 'password' },
    ],
  },
};
