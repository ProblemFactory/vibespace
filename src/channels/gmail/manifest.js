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
const { RELAY_DEFAULT } = require('../../consent-road.js');   // PURE: the project's public relay page (the relay setting's default — a person's own app only)

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
  options: [
    // lane oauth-relay-road (the owner 2026-10-22: one registered redirect per app, never one per instance): the relay page
    // a sign-in with a person's OWN Google client comes back through on THIS instance (a fleet pod rides the fleet's first,
    // VIBESPACE_OAUTH_RELAY_URL); addendum 1: a company preset never reads it — its own relayUrl › the fleet's, or none.
    // Read by the hub (serverSetting, the consent row's relayUrlSetting).
    {
      key: 'gmailRelayUrl', role: 'relayUrl', type: 'string', default: RELAY_DEFAULT,
      label: t('Gmail: relay page'),
      description: t('The https page a sign-in with your own Google OAuth client (its ID and secret typed here) comes back through: it sends the browser on to this VibeSpace when it runs on a private network and keeps nothing. The default is a public relay page you may register under the client’s Authorized redirect URIs (a Web application client) if this VibeSpace has no https address; on a fleet pod the fleet’s page comes first. A company client never uses this setting — it signs in through its own relay page. Empty = this instance’s own https address, else 127.0.0.1.'),
      tier: 'advanced',
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
  /** lane oauth-relay-road: an https relay page address, or empty (empty = the instance's own relay setting). */
  const relayPage = (v) => {
    const s = String(v);
    if (!s) return okV;
    if (/\s/.test(s)) return bad('must not contain whitespace');
    if (!/^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?(\/[^?#]*)?$/i.test(s) || s.length > 300) return bad('must be an https URL with no query (the vendor redirects to it)');
    return okV;
  };
  return {
    id: 'gmail',
    label: 'Gmail',
    fields: [
      { key: 'clientId', label: i18nKey('OAuth client ID'), secret: false, required: true, placeholder: '…apps.googleusercontent.com',
        help: i18nKey('Only when using your own client.'), validate: googleClientId },
      { key: 'clientSecret', label: i18nKey('OAuth client secret'), secret: true, required: true,
        help: i18nKey('Only when using your own client.'), validate: V.minLen(8) },
      // lane oauth-relay-road: a company preset's relay page (a VIBESPACE_GDRIVE_CLIENTS entry's `relayUrl`) — addendum 1:
      // the cluster's own page (the admin host's /relay/); empty = the fleet's, else none, never the public page
      { key: 'relayUrl', label: i18nKey('Relay page'), secret: false, required: false, placeholder: 'https://…/relay/',
        help: i18nKey('The company app’s relay page: the https page it sends every member back through after a sign-in — the fleet’s admin host /relay/. Register it once under the app’s Redirect URLs. Empty = the fleet’s relay page on a fleet pod, else none (the sign-in comes back to the instance’s own address). A company app never uses the public relay page.'), validate: relayPage },
    ],
    delegate: { to: 'drive-presets', prefer: 'channels', multi: true },
    // lane oauth-relay-road: where a Google client lists the relay pages the account dialog names (registered once)
    setup: {
      callbackNote: i18nKey('Google Cloud console → APIs & Services → Credentials → the OAuth client → Authorized redirect URIs. It must be a Web application client: a Desktop client cannot take an https address.'),
    },
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
