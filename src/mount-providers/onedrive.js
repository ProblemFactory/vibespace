// src/mount-providers/onedrive.js — Microsoft OneDrive (rclone's onedrive backend; the drive id is resolved through Graph).
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';

module.exports = {
  id: 'onedrive',
  oauth: 'microsoft',
  rcloneType: 'onedrive',
  oauthBacked: () => true,
  adopts: (rcloneType) => rcloneType === 'onedrive',
  label: (m) => 'OneDrive' + (m.driveType && m.driveType !== 'personal' ? ` (${m.driveType})` : '') + (m.remotePath ? `: ${m.remotePath}` : ''),
  fromRclone(cfg) {
    const pr = cfg.params || {};
    cfg = { ...cfg, type: 'onedrive',
      token: cfg.token || pr.token,
      remotePath: cfg.remotePath || '',
      driveId: cfg.driveId || pr.drive_id || null,
      driveType: cfg.driveType || pr.drive_type || 'personal',
      region: cfg.region || pr.region || null,
      clientId: cfg.clientId || pr.client_id || null,
      clientSecret: cfg.clientSecret || pr.client_secret || undefined,
    };
    return cfg;
  },
  adoptRecord(m, x) {
    const pr = {};
    for (const [k, v] of Object.entries(m.paramsEnc || {})) { try { pr[k] = x._dec(v); } catch {} }
    m.type = 'onedrive';
    if (pr.token && !m.tokenEnc) m.tokenEnc = x._enc(pr.token);
    if (pr.client_id && !m.clientId) m.clientId = pr.client_id;
    if (pr.client_secret && !m.clientSecretEnc) m.clientSecretEnc = x._enc(pr.client_secret);
    if (pr.drive_id && !m.driveId) m.driveId = pr.drive_id;
    m.driveType = m.driveType || pr.drive_type || 'personal';
    if (pr.region && !m.region) m.region = pr.region;
    m.remotePath = m.remotePath || '';
    const DK = new Set(['token', 'client_id', 'client_secret', 'drive_id', 'drive_type', 'region']);
    const extra = {};
    for (const [k, v] of Object.entries(m.paramsEnc || {})) if (!DK.has(k)) extra[k] = v;
    m.extraParamsEnc = { ...(m.extraParamsEnc || {}), ...extra };
    delete m.rcloneType; delete m.paramsEnc;
  },
  config(m, out, dec, x) {
    Object.assign(out, {
      token: dec(m.tokenEnc), remotePath: m.remotePath, driveId: m.driveId, driveType: m.driveType || 'personal',
      region: m.region, clientId: m.clientId, clientSecret: dec(m.clientSecretEnc),
    });
  },
  create(m, cfg, x) {
    if (!cfg.token) throw new Error('token required — use "Connect OneDrive" (guided sign-in)');
    let tok = String(cfg.token).trim();
    const jm = tok.match(/\{[\s\S]*\}/); if (jm) tok = jm[0];
    try { JSON.parse(tok); } catch { throw new Error('token must be the JSON printed by rclone authorize'); }
    Object.assign(m, {
      tokenEnc: x._enc(tok),
      remotePath: String(cfg.remotePath || cfg.driveFolder || '').replace(/^\/+|\/+$/g, ''),
      driveId: cfg.driveId ? String(cfg.driveId).trim() : null,
      driveType: cfg.driveType || 'personal',
      region: cfg.region || null,
      clientId: cfg.clientId || null,
      clientSecretEnc: cfg.clientSecret ? x._enc(cfg.clientSecret) : null,
    });
  },
  child(m, cfg, p, x) {
    m.remotePath = String(cfg.remotePath || cfg.driveFolder || '').replace(/^\/+|\/+$/g, '');
  },
  update(m, patch, setIf, x) {
    if (patch.remotePath !== undefined) m.remotePath = String(patch.remotePath || '').replace(/^\/+|\/+$/g, '');
    if (patch.driveId !== undefined) m.driveId = patch.driveId ? String(patch.driveId).trim() : null;
    if (patch.driveType !== undefined) m.driveType = patch.driveType || 'personal';
    if (patch.region !== undefined) m.region = patch.region || null;
    setIf('clientId');
    if (patch.clientSecret) m.clientSecretEnc = x._enc(String(patch.clientSecret));
    if (patch.token) { let t = String(patch.token).trim(); const jm = t.match(/\{[\s\S]*\}/); if (jm) t = jm[0]; JSON.parse(t); m.tokenEnc = x._enc(t); }
  },
  rclone(m, env, P, R, x) {
    env[P('TYPE')] = 'onedrive';
    env[P('TOKEN')] = x._dec(m.tokenEnc);
    if (m.driveId) env[P('DRIVE_ID')] = m.driveId;
    if (m.driveType) env[P('DRIVE_TYPE')] = m.driveType;
    if (m.region) env[P('REGION')] = m.region;
    if (m.clientId) { env[P('CLIENT_ID')] = m.clientId; if (m.clientSecretEnc) env[P('CLIENT_SECRET')] = x._dec(m.clientSecretEnc); }
    return `${R}:${m.remotePath || ''}`;
  },
  async preMount(m, id, x) {
    // OneDrive backstop: rclone refuses to create the fs without a resolved
    // drive_id/drive_type — resolve via Graph before spawning (an honest
    // error instead of rclone's cryptic "upgrading from older versions" one;
    // on success the ids persist on the record). Error recorded on the row
    // like the mountpoint branch — the route reply alone never reaches it.
    if (!m.driveId) {
      try { await x._resolveOneDriveDrive(m); x._save(); }
      catch (e) { x._errors.set(id, String(e.message || e)); x._notify(); throw e; }
    }
  },
  reauthClient(m, x) {
    return { backend: 'onedrive', clientId: m.clientId || undefined, clientSecret: m.clientSecretEnc ? x._dec(m.clientSecretEnc) : undefined };
  },
  writeToken(holder, tok, x) {
    holder.tokenEnc = x._enc(tok);
  },
  async afterToken(holder, x) {
    // Fresh token in hand — resolve the OneDrive drive now (best-effort;
    // the mount-time backstop retries and reports honestly if this fails).
    if (!holder.driveId) {
      try { await x._resolveOneDriveDrive(holder); x._save(); } catch {}
    }
  },
};
