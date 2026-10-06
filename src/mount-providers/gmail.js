// src/mount-providers/gmail.js — Gmail as a read-only folder: a SYNC WORKER (src/gmail-sync.js, `x.gmail`) writing .eml files, not a filesystem.
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it through tr()

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
  // the CLIENT cells (lane dc-mount-client): pure data GET /api/mounts publishes once (`providers`); src/lib/sidebar-mounts.js
  // renders the sidebar row, the Connect / submount / Edit dialogs and the re-authorize words from them — it names no provider
  client: {
    pick: 4, form: 3, pickLabel: 'Gmail', tag: 'Gmail',
    sync: true,             // a SYNC, not a filesystem: the row shows the sync line (the list cells gmailState / gmailProgress)
    unmountLabel: i18nKey('Stop syncing (synced emails stay)'),
    names: { product: 'Gmail', signin: 'Google' }, presets: true,
    clientSwitch: { identity: 'id+secret', authBase: '/api/mounts/gmail-auth', statusFail: 'error', pastePlaceholder: 'http://127.0.0.1:…/?state=…&code=…', finish: 'patch' },
    widgets: ['gmail-connect', 'gmail-labels'],
    submit: { map: { token: 'gmailToken' }, set: { mode: 'ro' }, client: { choice: 'gmailClientChoice', id: 'gmailClientId', secret: 'gmailClientSecret' }, drop: ['gmailToken', 'gmailClientChoice', 'gmailClientId', 'gmailClientSecret'] },
    edit: [
      { key: 'syncCount', label: i18nKey('Messages to sync (newest N; 0 = everything)'), placeholder: '200', keepZero: true },
      { key: 'groupBy', label: i18nKey('Organize into folders'), default: 'none', type: 'select', options: [['none', i18nKey('No grouping (flat)')], ['month', i18nKey('By month (YYYY-MM)')], ['day', i18nKey('By day (YYYY-MM-DD)')], ['label-month', i18nKey('By label, then month (Inbox/2026-07)')], ['label-day', i18nKey('By label, then day')]] },
      { key: 'labelIds', label: i18nKey('Labels (comma list)'), placeholder: 'INBOX' },
      { key: 'query', label: i18nKey('Search filter (Gmail query)') },
      { key: 'clientPreset', label: i18nKey('OAuth client'), type: 'select', options: [['', i18nKey('(custom / built-in client)')]], presets: true },
      { key: 'token', label: i18nKey('OAuth token (JSON — re-run Connect Gmail to replace)'), type: 'textarea' },
    ],
    connect: [
      { key: 'gmailClientChoice', label: i18nKey('OAuth client'), type: 'select', clients: {}, value: { preset: 'custom' },
        hint: { presets: i18nKey('Gmail has no built-in fallback client — pick a preset or provide your own. The client needs the gmail.readonly scope.'), none: i18nKey('No company OAuth client on this instance — ask your admin, or provide your own (it needs the gmail.readonly scope).') } },
      { key: 'gmailClientId', label: i18nKey('Custom OAuth client ID'), placeholder: '….apps.googleusercontent.com', when: { gmailClientChoice: 'custom' } },
      { key: 'gmailClientSecret', label: i18nKey('Custom OAuth client secret'), type: 'password', when: { gmailClientChoice: 'custom' } },
      { key: 'gmailToken', label: i18nKey('Gmail access'), type: 'textarea', placeholder: i18nKey('click "Connect Gmail" below — no terminal needed'),
        hint: i18nKey('This is a SYNC, not a live mount: emails download into the folder as .eml files (read-only archive) and keep syncing while connected.') },
      { key: 'syncCount', label: i18nKey('Messages to sync (newest N; 0 = everything)'), placeholder: '200',
        hint: i18nKey('0 syncs the ENTIRE mailbox — archived and spam/trash included when no label filter is set. Large mailboxes take a while (quota-paced); the card shows live progress.') },
      { key: 'groupBy', label: i18nKey('Organize into folders'), type: 'select',
        options: [['label-month', i18nKey('By label, then month (Inbox/2026-07)')], ['label-day', i18nKey('By label, then day')], ['month', i18nKey('By month (YYYY-MM)')], ['day', i18nKey('By day (YYYY-MM-DD)')], ['none', i18nKey('No grouping (flat)')]],
        hint: i18nKey('Label layout files each mail under Inbox / Archive / Sent / Spam / Trash / Drafts (Gmail precedence; "archived" = not in the inbox), with a date folder inside.') },
      { key: 'labelIds', label: i18nKey('Labels filter (blank = whole mailbox)'), placeholder: i18nKey('blank = everything — or e.g. INBOX, SENT, STARRED'), advanced: true,
        hint: i18nKey('Comma list of Gmail label ids — use “List labels” after connecting to pick from your real labels.') },
      { key: 'query', label: i18nKey('Search filter (Gmail query, optional)'), placeholder: 'from:boss@example.com newer_than:30d', advanced: true },
    ],
  },
};
