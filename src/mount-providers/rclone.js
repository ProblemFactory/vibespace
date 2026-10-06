// src/mount-providers/rclone.js — ANY rclone backend the owner configures by hand (backend name + raw params, every value sealed).
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through tr()

module.exports = {
  id: 'rclone',
  rawRclone: true,        // the generic row: its records name their rclone backend (`rcloneType`) and carry raw params —
                          // a backend another row adopts (drive / onedrive / the cloud list) normalizes to that row
  s3Backend: (m) => m.rcloneType === 's3',
  oauthBacked: (m, MM) => MM.OAUTH_BACKENDS.includes(m.rcloneType),
  rootMayBeDenied: (m, MM) => MM.BUCKETY_BACKENDS.has(m.rcloneType),   // bucket-scoped keys can't list the root
  label: (m) => `${m.rcloneType}:${m.remotePath || ''}`,
  config(m, out, dec, x) {
    const pr = Object.fromEntries(Object.entries(m.paramsEnc || {}).map(([k, v]) => [k, x._dec(v)]));
    Object.assign(out, { rcloneType: m.rcloneType, remotePath: m.remotePath, params: pr });
    if (m.rcloneType === 'drive') {
      out.clientPreset = m.clientPreset;
      out.driveMode = m.driveMode || (pr.team_drive ? 'shared-drive' : pr.shared_with_me === 'true' ? 'shared-with-me' : 'mydrive');
      out.teamDriveId = m.teamDriveId || pr.team_drive || '';
      out.rootFolderId = m.rootFolderId || pr.root_folder_id || '';
    }
  },
  create(m, cfg, x) {
    // Any rclone backend the user knows how to configure: backend name +
    // freeform params → RCLONE_CONFIG_VS_<KEY>. All param values encrypted
    // (safe default — many are secrets); non-secret ones cost nothing.
    if (!cfg.rcloneType) throw new Error('rclone backend type required (e.g. dropbox, b2, azureblob)');
    const params = cfg.params && typeof cfg.params === 'object' ? cfg.params : {};
    if (!Object.keys(params).length && !cfg.remotePath) throw new Error('at least one parameter required');
    m.rcloneType = String(cfg.rcloneType).trim();
    m.paramsEnc = {};
    for (const [k, v] of Object.entries(params)) m.paramsEnc[k] = x._enc(String(v));
    m.remotePath = String(cfg.remotePath || '').replace(/^\/+/, '');
  },
  child(m, cfg, p, x) {
    if (p.rcloneType === 'drive') {
      // rclone-drive submount: remotePath = folder inside the chosen scope
      m.remotePath = String(cfg.remotePath || '').replace(/^\/+/, '');
      if (cfg.driveMode !== undefined) m.driveMode = x.constructor._driveMode(cfg.driveMode) || 'mydrive';
      if (cfg.teamDriveId !== undefined) m.teamDriveId = cfg.teamDriveId ? String(cfg.teamDriveId).trim() : null;
      if (cfg.rootFolderId !== undefined) m.rootFolderId = cfg.rootFolderId ? String(cfg.rootFolderId).trim() : null;
    } else {
      if (!cfg.remotePath) throw new Error('remote path required (e.g. bucket-name or bucket/prefix)');
      m.remotePath = String(cfg.remotePath).replace(/^\/+/, '');
    }
  },
  updateChild(m, patch, setIf, x) {
    if (patch.remotePath !== undefined && patch.remotePath !== '') m.remotePath = String(patch.remotePath).replace(/^\/+/, '');
  },
  update(m, patch, setIf, x) {
    setIf('rcloneType', (v) => String(v).trim());
    if (patch.remotePath !== undefined) m.remotePath = String(patch.remotePath || '').replace(/^\/+/, '');
    if ((m.rcloneType === 'drive') || patch.rcloneType === 'drive') {
      if (patch.clientPreset !== undefined) {
        m.clientPreset = patch.clientPreset ? String(patch.clientPreset) : null;
        if (m.clientPreset) { delete m.paramsEnc.client_id; delete m.paramsEnc.client_secret; } // preset wins
      }
      if (patch.driveMode !== undefined) m.driveMode = x.constructor._driveMode(patch.driveMode) || 'mydrive';
      if (patch.teamDriveId !== undefined) m.teamDriveId = patch.teamDriveId ? String(patch.teamDriveId).trim() : null;
      if (patch.rootFolderId !== undefined) m.rootFolderId = patch.rootFolderId ? String(patch.rootFolderId).trim() : null;
      // retire the legacy scope params so the independent fields are authoritative
      for (const k of ['shared_with_me', 'team_drive', 'root_folder_id']) delete m.paramsEnc[k];
    }
    if (patch.params && typeof patch.params === 'object') {
      for (const [k, v] of Object.entries(patch.params)) {
        if (v === '' || v == null) delete m.paramsEnc[k];
        else m.paramsEnc[k] = x._enc(String(v));
      }
    }
  },
  rclone(m, env, P, R, x) {
    env[P('TYPE')] = m.rcloneType;
    for (const [k, blob] of Object.entries(m.paramsEnc || {})) env[P(k.toUpperCase())] = x._dec(blob);
    // rclone-backed Google Drive is a first-class Drive (2.135.3): the same
    // preset client + cloud-side scope as a native 'drive' record, stored
    // in INDEPENDENT fields that OVERRIDE the raw rclone params (which stay
    // as a fallback for records imported before this).
    if (m.rcloneType === 'drive') {
      if (m.clientPreset) {
        const pc = x.constructor._driveClient({ clientPreset: m.clientPreset });
        if (pc) { env[P('CLIENT_ID')] = pc.clientId; env[P('CLIENT_SECRET')] = pc.clientSecret; }
      }
      if (m.rootFolderId) env[P('ROOT_FOLDER_ID')] = m.rootFolderId;
      else if (m.driveMode === 'shared-with-me') { env[P('SHARED_WITH_ME')] = 'true'; delete env[P('TEAM_DRIVE')]; }
      if (m.driveMode === 'shared-drive' && m.teamDriveId) { env[P('TEAM_DRIVE')] = m.teamDriveId; delete env[P('SHARED_WITH_ME')]; }
      if (m.driveMode === 'mydrive') { delete env[P('SHARED_WITH_ME')]; delete env[P('TEAM_DRIVE')]; }
    }
    return `${R}:${m.remotePath || ''}`;
  },
  reauthClient(m, x) {
    if (m.rcloneType !== 'drive') throw new Error('Not an OAuth cloud connection');
    const p = (k) => m.paramsEnc?.[k] ? x._dec(m.paramsEnc[k]) : undefined;
    return { clientId: p('client_id'), clientSecret: p('client_secret') };
  },
  writeToken(holder, tok, x) {
    if (holder.rcloneType !== 'drive') throw new Error('Not an OAuth cloud connection');
    holder.paramsEnc = holder.paramsEnc || {};
    holder.paramsEnc.token = x._enc(tok);
  },
  // the CLIENT cells (lane dc-mount-client): pure data GET /api/mounts publishes once (`providers`); src/lib/sidebar-mounts.js
  // renders the sidebar row, the Connect / submount / Edit dialogs and the re-authorize words from them — it names no provider
  client: {
    offersChild: true,   // the sidebar row's ＋ (a submount under it)
    pick: 9, form: 9, pickLabel: i18nKey('Custom / advanced (rclone)'), tagFromSource: 'rclone',
    names: { product: 'Google Drive', signin: 'Google' },
    driveReauth: { rcloneType: 'drive' },   // a raw record over rclone's drive backend re-authorizes like Drive
    submit: { kv: ['params'] },
    child: { path: { key: 'remotePath', label: i18nKey('Remote path (bucket[/prefix])'), placeholder: 'bucket-name/optional/prefix' } },
    edit: [
      { key: 'remotePath', label: i18nKey('Remote path (bucket[/prefix])'), placeholder: 'bucket-name/optional/prefix' },
      { params: true },   // each stored parameter is prefilled; clearing its value removes it
      { key: 'newParamKey', label: i18nKey('Add parameter — name'), placeholder: 'e.g. region' },
      { key: 'newParamValue', label: i18nKey('Add parameter — value') },
    ],
    editChild: [{ key: 'remotePath', label: i18nKey('Remote path (bucket[/prefix])'), placeholder: 'bucket-name/optional/prefix' }],
    connect: [
      { key: 'rcloneType', label: i18nKey('rclone backend'), placeholder: 'dropbox / b2 / azureblob / mega / …', hint: i18nKey("Any backend rclone supports — see rclone.org/docs. Params below map to that backend's config keys.") },
      { key: 'params', label: i18nKey('Parameters (one key = value per line)'), type: 'textarea', placeholder: 'token = {"access_token":…}\naccount = my-account\nkey = …', hint: i18nKey('e.g. b2 wants account + key; dropbox wants token. All values encrypted at rest.') },
      { key: 'remotePath', label: i18nKey('Path within the remote (optional)'), placeholder: 'folder/subfolder' },
    ],
  },
};
