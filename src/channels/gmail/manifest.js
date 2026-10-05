'use strict';
// src/channels/gmail/manifest.js — GMAIL'S MANIFEST (lane dc-channels-manifest — rv-channels-core C3/C4, rv-channel-adapters
// F2/F8/F10). PURE and bundle-safe: no fs, no net, nothing required but pure modules — the browser bundle reads it
// through src/channels/registry-list.js. It DECLARES what three shared files used to hold by hand for this vendor:
//   settings        its per-vendor settings table (src/channel-settings.js derives CHANNEL_SETTINGS from it: the
//                   budget / pace rows the adapter's caps spread, the engine bounds, the "Per vendor" schema rows) +
//                   its OPTION rows (`options`, rv C4: src/lib/settings-schema.js derives them in place)
//   integrationRow  its integration row + its own validators (src/integration-registry.js derives ROWS from it, in
//                   the list's order), built with the registry's generic validator kit { V, okV, bad }
//   adapter         the repo path of the adapter module the engine registers (REAL_ADAPTERS is derived from the list)
// `t` / `i18nKey` are only EXTRACTION MARKERS (English-string-as-key): the client re-wraps every word with the real t().
const t = (s) => s;
const i18nKey = (s) => s;

// Gmail meters in quota units, 6000 a minute per user (a thread read 40, a change check 2), and refuses bursts well
// inside that (lane R5): half the minute (3000), 40 units a second = one thread read a second
const settings = {
  vendor: 'gmail', vendorName: t('Gmail'),
  rows: [
    {
      key: 'budgetGmailPerMin', role: 'budget', type: 'number', default: 3000, min: 100, max: 6000, step: 100,
      label: t('Gmail: quota units per minute per account'),
      description: t('Gmail allows 6000 quota units a minute per user (a thread read costs 40, a change check 2). When an account reaches this budget its refreshes wait for the next minute, and the account card says so.'),
    },
    {
      key: 'gmailUnitsPerSec', role: 'pace', type: 'number', default: 40, min: 5, max: 100, step: 5,
      label: t('Gmail: quota units per second per account'),
      description: t('Reads are spread evenly: at most this many quota units a second (a thread read costs 40, so 40 = one thread a second), and never faster than the per-minute budget above allows. Google refuses bursts well inside its 6000-a-minute cap; when it does, the account waits a few seconds and the card says so.'),
    },
  ],
};

/** Its integration row (what src/integration-registry.js held under its id) and its own validators. */
function integrationRow({ V, okV, bad }) {
  const googleClientId = (v) => {
    const s = String(v);
    if (!s) return bad('must not be empty');
    if (/\s/.test(s)) return bad('must not contain whitespace');
    if (!/\.apps\.googleusercontent\.com$/.test(s)) return bad('a Google OAuth client id ends with .apps.googleusercontent.com');
    return okV;
  };
  // ── GMAIL — a DELEGATING row (decision 5, owner 2026-09-13) ─────────────
  // It REUSES the existing VibeSpace Google OAuth client preset mechanism
  // (`VIBESPACE_GDRIVE_CLIENTS`, read by MountManager.drivePresets()) and has
  // NO env of its own. Resolution order (§14.2): the user's SAVED choice >
  // `prefer` > the only preset. There is no fourth rung — `_driveClient()`'s
  // `'default'` fallback answers null on a two-preset list and is exactly the
  // shape this row refuses to inherit.
  return {
    id: 'gmail',
    label: 'Gmail',
    fields: [
      { key: 'clientId', label: i18nKey('OAuth client ID'), secret: false, required: true, placeholder: '…apps.googleusercontent.com',
        help: i18nKey('Only when using your own client.'), validate: googleClientId },
      { key: 'clientSecret', label: i18nKey('OAuth client secret'), secret: true, required: true,
        help: i18nKey('Only when using your own client.'), validate: V.minLen(8) },
    ],
    delegate: { to: 'drive-presets', prefer: 'channels', multi: true },
    setup: null,
    test: {
      kind: 'shape-only',
      describe: i18nKey('Checks the client id / secret shape and builds the authorization URL. A Google OAuth client cannot be exchanged for anything on its own (no client-credentials grant), so the real verdict is the OAuth round trip.'),
      caveat: i18nKey('Shape only. Whether the consent succeeds, and how long the refresh token lives, depends on the client\'s verification status.'),
    },
    consumers: ['src/channels/gmail.js'],
    usedBy: i18nKey('Used by the Gmail channel'),
    bindsPerAccount: true,
    signinName: 'Google',
    clientHint: i18nKey('The Google OAuth client this account signs in through. A refresh token is bound to the client it was issued under — switching the client means signing in again.'),
    docs: 'docs/design-communication-panel.zh.md',
  };
}

module.exports = { kind: 'gmail', adapter: 'src/channels/gmail.js', settings, integrationRow };
