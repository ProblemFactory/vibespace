// src/mount-providers/sftp.js — an SSH server over SFTP (a key file or a password).
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';

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
};
