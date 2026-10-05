// src/mount-providers/cloud.js — the OAuth cloud backends rclone signs in to (Dropbox, Box, pCloud, … — MountManager.CLOUD_BACKENDS).
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';

module.exports = {
  id: 'cloud',
  oauth: null,            // rclone's own client per backend — nothing to lend
  oauthBacked: () => true,
  adopts: (rcloneType, MM) => !!MM.CLOUD_BACKENDS[rcloneType],
  label: (m, MM) => (MM.CLOUD_BACKENDS[m.backend]?.label || m.backend || 'Cloud') + (m.remotePath ? `: ${m.remotePath}` : ''),
  fromRclone(cfg) {
    const pr = cfg.params || {};
    cfg = { ...cfg, type: 'cloud', backend: cfg.rcloneType,
      token: cfg.token || pr.token,
      remotePath: cfg.remotePath || '',
      clientId: cfg.clientId || pr.client_id || null,
      clientSecret: cfg.clientSecret || pr.client_secret || undefined,
    };
    return cfg;
  },
  adoptRecord(m, x) {
    m.type = 'cloud';
    m.backend = m.rcloneType;
    const pe = m.paramsEnc || {};
    if (pe.token && !m.tokenEnc) m.tokenEnc = pe.token; // both are enc-at-rest — move, don't re-encrypt
    if (!m.clientId) { try { m.clientId = pe.client_id ? x._dec(pe.client_id) : null; } catch { m.clientId = null; } }
    if (pe.client_secret && !m.clientSecretEnc) m.clientSecretEnc = pe.client_secret;
    m.remotePath = m.remotePath || '';
    const DK = new Set(['token', 'client_id', 'client_secret']);
    const rest = Object.fromEntries(Object.entries(pe).filter(([k]) => !DK.has(k)));
    m.extraParamsEnc = { ...rest, ...(m.extraParamsEnc || {}) };
    delete m.paramsEnc; delete m.rcloneType;
  },
  config(m, out, dec, x) {
    Object.assign(out, {
      backend: m.backend, token: dec(m.tokenEnc), remotePath: m.remotePath,
      clientId: m.clientId, clientSecret: dec(m.clientSecretEnc),
    });
  },
  create(m, cfg, x) {
    const cb = x.constructor.CLOUD_BACKENDS[cfg.backend];
    if (!cb) throw new Error('unknown cloud provider: ' + cfg.backend);
    if (!cfg.token) throw new Error(`token required — use "Connect ${cb.label}" (guided sign-in)`);
    let tok = String(cfg.token).trim();
    const jm = tok.match(/\{[\s\S]*\}/); if (jm) tok = jm[0];
    try { JSON.parse(tok); } catch { throw new Error('token must be the JSON printed by rclone authorize'); }
    Object.assign(m, {
      backend: cfg.backend,
      tokenEnc: x._enc(tok),
      remotePath: String(cfg.remotePath || '').replace(/^\/+|\/+$/g, ''),
      clientId: cfg.clientId || null,
      clientSecretEnc: cfg.clientSecret ? x._enc(cfg.clientSecret) : null,
    });
  },
  child(m, cfg, p, x) {
    m.remotePath = String(cfg.remotePath || '').replace(/^\/+|\/+$/g, '');
  },
  update(m, patch, setIf, x) {
    if (patch.remotePath !== undefined) m.remotePath = String(patch.remotePath || '').replace(/^\/+|\/+$/g, '');
    setIf('clientId');
    if (patch.clientSecret) m.clientSecretEnc = x._enc(String(patch.clientSecret));
    if (patch.token) { let t = String(patch.token).trim(); const jm = t.match(/\{[\s\S]*\}/); if (jm) t = jm[0]; JSON.parse(t); m.tokenEnc = x._enc(t); }
  },
  rclone(m, env, P, R, x) {
    env[P('TYPE')] = m.backend;
    env[P('TOKEN')] = x._dec(m.tokenEnc);
    if (m.clientId) { env[P('CLIENT_ID')] = m.clientId; if (m.clientSecretEnc) env[P('CLIENT_SECRET')] = x._dec(m.clientSecretEnc); }
    return `${R}:${m.remotePath || ''}`;
  },
  reauthClient(m, x) {
    return { backend: m.backend, clientId: m.clientId || undefined, clientSecret: m.clientSecretEnc ? x._dec(m.clientSecretEnc) : undefined };
  },
  writeToken(holder, tok, x) {
    holder.tokenEnc = x._enc(tok);
  },
};
