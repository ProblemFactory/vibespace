// src/mount-providers/gmail.js — Gmail as a read-only folder: a SYNC WORKER (src/gmail-sync.js, `x.gmail`) writing .eml files, not a filesystem.
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';

module.exports = {
  id: 'gmail',
  oauth: 'google',
  presetClient: { idAlone: false },   // D2: a custom client is its id AND its secret
  filesystem: false,      // no fuse mount to probe, shadow or remount — the worker owns the folder
  rclone: false,          // needs no rclone binary
  labels: true,           // the labels picker (listGmailLabels)
  syncStateFile: '.vibespace-gmail-state.json',   // dropped on a scope change (update() answers 'reseed')
  label: (m) => 'Gmail' + (m.email ? `: ${m.email}` : '') + (m.query ? ` (${m.query})` : ''),
  listFields: (m, x) => { const st = x.gmail.status(m.id); return { email: m.email || st?.email, syncCount: m.syncCount, labelIds: m.labelIds, query: m.query, gmailState: st?.state || null, gmailCount: st?.count ?? null, gmailError: st?.error || null, lastSyncAt: st?.lastSyncAt || null, gmailProgress: st?.progress || null }; },
  isMounted: (m, x) => !!x.gmail.status(m.id),
  mount: (id, x) => x._mountGmail(id),
  unmount(m, id, mp, finish, x) {
    x.gmail.stop(id);
    return Promise.resolve(finish(true)); // synced .eml files stay — they're the archive
  },
  config(m, out, dec, x) {
    Object.assign(out, {
      token: dec(m.tokenEnc), clientId: m.clientId, clientSecret: dec(m.clientSecretEnc), clientPreset: m.clientPreset,
      syncCount: m.syncCount, labelIds: m.labelIds, query: m.query, groupBy: m.groupBy, email: m.email,
    });
  },
  create(m, cfg, x) {
    if (!cfg.token) throw new Error('token required — use "Connect Gmail" (guided sign-in)');
    let tok = String(cfg.token).trim();
    try { JSON.parse(tok); } catch { throw new Error('gmail token must be the JSON from the guided flow'); }
    Object.assign(m, {
      tokenEnc: x._enc(tok),
      clientPreset: cfg.clientPreset ? String(cfg.clientPreset) : null,
      clientId: cfg.clientId || null,
      clientSecretEnc: cfg.clientSecret ? x._enc(cfg.clientSecret) : null,
      // syncCount 0 = EVERYTHING (engine hard-caps at 200k); blank = 200
      syncCount: String(cfg.syncCount ?? '').trim() === '' ? 200 : Math.max(0, Number(cfg.syncCount) || 0),
      groupBy: ['none', 'month', 'day', 'label-month', 'label-day'].includes(cfg.groupBy) ? cfg.groupBy : 'label-month',
      labelIds: String(cfg.labelIds || ''),
      query: String(cfg.query || ''),
      email: cfg.email ? String(cfg.email) : null,
      mode: 'ro', // read-only archive by design
    });
  },
  update(m, patch, setIf, x) {
    // Scope changes (filter/count) must FORCE A RESEED: the persisted
    // history cursor keeps the sync incremental, so newly-in-scope OLD
    // mail (e.g. clearing the INBOX filter to sync archived) would never
    // arrive. Dropping the state file is safe — the directory is the
    // dedup index, a reseed re-lists and skips every existing file.
    const scopeChanged = ['syncCount', 'labelIds', 'query'].some((k) => patch[k] !== undefined);
    if (patch.syncCount !== undefined) m.syncCount = String(patch.syncCount).trim() === '' ? 200 : Math.max(0, Number(patch.syncCount) || 0);
    if (patch.groupBy !== undefined) m.groupBy = ['none', 'month', 'day', 'label-month', 'label-day'].includes(patch.groupBy) ? patch.groupBy : 'none';
    if (patch.labelIds !== undefined) m.labelIds = String(patch.labelIds || '');
    if (patch.query !== undefined) m.query = String(patch.query || '');
    if (patch.clientPreset !== undefined) m.clientPreset = patch.clientPreset ? String(patch.clientPreset) : null;
    if (patch.token) { JSON.parse(String(patch.token).trim()); m.tokenEnc = x._enc(String(patch.token).trim()); }
    return scopeChanged ? 'reseed' : undefined;
  },
};
