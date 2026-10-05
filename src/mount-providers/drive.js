// src/mount-providers/drive.js — Google Drive (rclone's drive backend, a Google OAuth client: a preset key or the owner's own).
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';

module.exports = {
  id: 'drive',
  oauth: 'google',        // the vendor of the OAuth client the record may lend a channel account (MountManager.OAUTH_CLIENT_VENDOR)
  rcloneType: 'drive',
  presetClient: { idAlone: true, reauthSwitch: true },   // D2: a custom client id alone is its identity; Re-authorize may switch the client
  driveModeDefault: 'mydrive',
  sharedDrives: true,     // listSharedDrives (`rclone backend drives`)
  oauthBacked: () => true,
  // ONE Google Drive: a raw rclone record / add of this backend normalizes to this row
  adopts: (rcloneType) => rcloneType === 'drive',
  fromRclone(cfg) {
    const pr = cfg.params || {};
    cfg = { ...cfg, type: 'drive',
      clientId: cfg.clientId || pr.client_id || null,
      clientSecret: cfg.clientSecret || pr.client_secret || undefined,
      token: cfg.token || pr.token,
      driveFolder: cfg.driveFolder || cfg.remotePath || '',
      driveMode: cfg.driveMode || (pr.team_drive ? 'shared-drive' : pr.shared_with_me === 'true' ? 'shared-with-me' : 'mydrive'),
      teamDriveId: cfg.teamDriveId || pr.team_drive,
      rootFolderId: cfg.rootFolderId || pr.root_folder_id,
    };
    return cfg;
  },
  adoptRecord(m, x) {
    const pr = {};
    for (const [k, v] of Object.entries(m.paramsEnc || {})) { try { pr[k] = x._dec(v); } catch {} }
    m.type = 'drive';
    if (pr.client_id && !m.clientId) m.clientId = pr.client_id;
    if (pr.client_secret && !m.clientSecretEnc) m.clientSecretEnc = x._enc(pr.client_secret);
    if (pr.token && !m.tokenEnc) m.tokenEnc = x._enc(pr.token);
    m.driveMode = m.driveMode || (pr.team_drive ? 'shared-drive' : pr.shared_with_me === 'true' ? 'shared-with-me' : 'mydrive');
    if (pr.team_drive && !m.teamDriveId) m.teamDriveId = pr.team_drive;
    if (pr.root_folder_id && !m.rootFolderId) m.rootFolderId = pr.root_folder_id;
    if (!m.parentId) m.driveFolder = m.driveFolder || m.remotePath || '';
    else m.driveFolder = m.driveFolder || m.remotePath || ''; // child too
    // preserve any NON-drive params (rare custom tuning) as extra options
    const DRIVE_KEYS = new Set(['client_id', 'client_secret', 'token', 'scope', 'team_drive', 'shared_with_me', 'root_folder_id']);
    const extra = {};
    for (const [k, v] of Object.entries(m.paramsEnc || {})) if (!DRIVE_KEYS.has(k)) extra[k] = v;
    m.extraParamsEnc = { ...(m.extraParamsEnc || {}), ...extra };
    delete m.rcloneType; delete m.paramsEnc; delete m.remotePath;
  },
  label(m) {
    const scope = m.driveMode === 'shared-with-me' ? ' (shared with me)' : m.driveMode === 'shared-drive' ? ' (shared drive)' : '';
    return 'Google Drive' + scope + (m.driveFolder ? `: ${m.driveFolder}` : '');
  },
  config(m, out, dec, x) {
    Object.assign(out, {
      driveFolder: m.driveFolder, token: dec(m.tokenEnc), clientId: m.clientId, clientSecret: dec(m.clientSecretEnc),
      driveMode: m.driveMode, teamDriveId: m.teamDriveId, rootFolderId: m.rootFolderId, clientPreset: m.clientPreset,
    });
  },
  create(m, cfg, x) {
    // token = the JSON blob printed by `rclone authorize "drive"` (run it
    // on any machine with a browser and paste the result here)
    if (!cfg.token) throw new Error('token required (run: rclone authorize "drive")');
    let tok = String(cfg.token).trim();
    const jsonMatch = tok.match(/\{[\s\S]*\}/); // tolerate the surrounding "Paste the following…" noise
    if (jsonMatch) tok = jsonMatch[0];
    try { JSON.parse(tok); } catch { throw new Error('token must be the JSON printed by rclone authorize'); }
    Object.assign(m, {
      tokenEnc: x._enc(tok),
      driveFolder: String(cfg.driveFolder || '').replace(/^\/+|\/+$/g, ''),
      driveMode: x.constructor._driveMode(cfg.driveMode),
      teamDriveId: cfg.teamDriveId ? String(cfg.teamDriveId).trim() : null,
      rootFolderId: cfg.rootFolderId ? String(cfg.rootFolderId).trim() : null,
      clientId: cfg.clientId || null,
      clientPreset: cfg.clientPreset ? String(cfg.clientPreset) : null,
      clientSecretEnc: cfg.clientSecret ? x._enc(cfg.clientSecret) : null,
    });
  },
  child(m, cfg, p, x) {
    m.driveFolder = String(cfg.driveFolder || '').replace(/^\/+|\/+$/g, '');
    if (cfg.driveMode !== undefined) m.driveMode = x.constructor._driveMode(cfg.driveMode);
    if (cfg.teamDriveId !== undefined) m.teamDriveId = cfg.teamDriveId ? String(cfg.teamDriveId).trim() : null;
    if (cfg.rootFolderId !== undefined) m.rootFolderId = cfg.rootFolderId ? String(cfg.rootFolderId).trim() : null;
  },
  updateChild(m, patch, setIf, x) {
    if (patch.driveFolder !== undefined) m.driveFolder = String(patch.driveFolder || '').replace(/^\/+|\/+$/g, '');
    if (patch.driveMode !== undefined) m.driveMode = x.constructor._driveMode(patch.driveMode);
    if (patch.teamDriveId !== undefined) m.teamDriveId = patch.teamDriveId ? String(patch.teamDriveId).trim() : null;
    if (patch.rootFolderId !== undefined) m.rootFolderId = patch.rootFolderId ? String(patch.rootFolderId).trim() : null;
  },
  update(m, patch, setIf, x) {
    if (patch.driveFolder !== undefined) m.driveFolder = String(patch.driveFolder || '').replace(/^\/+|\/+$/g, '');
    if (patch.driveMode !== undefined) m.driveMode = x.constructor._driveMode(patch.driveMode);
    if (patch.teamDriveId !== undefined) m.teamDriveId = patch.teamDriveId ? String(patch.teamDriveId).trim() : null;
    if (patch.rootFolderId !== undefined) m.rootFolderId = patch.rootFolderId ? String(patch.rootFolderId).trim() : null;
    if (patch.clientPreset !== undefined) m.clientPreset = patch.clientPreset ? String(patch.clientPreset) : null;
    setIf('clientId');
    if (patch.clientSecret) m.clientSecretEnc = x._enc(String(patch.clientSecret));
    if (patch.token) {
      let tok = String(patch.token).trim();
      const jm = tok.match(/\{[\s\S]*\}/); if (jm) tok = jm[0];
      JSON.parse(tok); // validate
      m.tokenEnc = x._enc(tok);
    }
  },
  rclone(m, env, P, R, x) {
    env[P('TYPE')] = 'drive';
    env[P('TOKEN')] = x._dec(m.tokenEnc);
    env[P('SCOPE')] = 'drive';
    if (m.clientId) { env[P('CLIENT_ID')] = m.clientId; if (m.clientSecretEnc) env[P('CLIENT_SECRET')] = x._dec(m.clientSecretEnc); }
    else {
      // Instance-preset client (admin-injected env; record stores only the
      // preset KEY — see drivePresets). Never persisted app-side.
      const pc = x.constructor._driveClient(m);
      if (pc) { env[P('CLIENT_ID')] = pc.clientId; env[P('CLIENT_SECRET')] = pc.clientSecret; }
    }
    // Cloud-side SCOPE of the mount (2.131.0): shared-with-me / a Shared
    // Drive are separate namespaces in the Drive API — rclone exposes them
    // as per-remote params. Each VibeSpace mount runs its OWN rclone
    // daemon+env, so these are freely per-child (same credential parent,
    // different scopes).
    // root_folder_id ALONE is the mount-one-shared-folder pattern; combining
    // it with shared_with_me breaks path resolution (rclone forum guidance) —
    // an explicit folder id wins over the scope flag.
    if (m.rootFolderId) env[P('ROOT_FOLDER_ID')] = m.rootFolderId;
    else if (m.driveMode === 'shared-with-me') env[P('SHARED_WITH_ME')] = 'true';
    if (m.driveMode === 'shared-drive' && m.teamDriveId) env[P('TEAM_DRIVE')] = m.teamDriveId;
    return `${R}:${m.driveFolder || ''}`;
  },
  reauthClient(m, x) {
    let clientId, clientSecret;
    clientId = m.clientId || undefined;
    clientSecret = m.clientSecretEnc ? x._dec(m.clientSecretEnc) : undefined;
    if (!clientId) {
      const pc = x.constructor._driveClient(m); // record's preset (or single default)
      if (pc) { clientId = pc.clientId; clientSecret = pc.clientSecret; }
    }
    return { clientId, clientSecret };
  },
  writeToken(holder, tok, x) {
    holder.tokenEnc = x._enc(tok);
  },
};
