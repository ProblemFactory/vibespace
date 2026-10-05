'use strict';
// src/channels/lark/manifest.js — LARK'S MANIFEST (lane dc-channels-manifest — rv-channels-core C3/C4, rv-channel-adapters
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

/** THE ONE DEFINITION of Lark's registered redirect URL (decision 4, owner
 *  2026-09-13): a VibeSpace-owned FIXED loopback, never a per-instance public
 *  address — every user's instance URL differs, so the callback can only land
 *  on the machine the user's browser is on and be pasted back (decision 21).
 *  The port is chosen HERE, once. src/oauth-loopback.js imports this. */
const LARK_CALLBACK_URL = 'http://127.0.0.1:17865/lark/cb';

// Lark's frequency tiers are per API, per app, per TENANT ("1000/min, 50/s" for the chat / message / member /
// resource reads) and a cluster app shares that pool with every instance and user: 60 a minute (6 %), 5 a second
const settings = {
  vendor: 'lark', vendorName: t('Lark'),
  rows: [
    {
      key: 'budgetLarkPerMin', role: 'budget', type: 'number', default: 60, min: 5, max: 1000, step: 5,
      label: t('Lark: requests per minute per account'),
      description: t('Lark allows 1000 requests a minute per API for the whole app across every instance and user that shares it. When an account reaches this budget its refreshes wait for the next minute, and the account card says so.'),
    },
    {
      key: 'larkRequestsPerSec', role: 'pace', type: 'number', default: 5, min: 1, max: 50, step: 1,
      label: t('Lark: requests per second per account'),
      description: t('Requests are spread evenly: at most this many a second, and never faster than the per-minute budget above allows. Lark allows 50 a second per API for the whole app across every instance and user that shares it.'),
    },
  ],
  options: [
    // lane lark-threads (B5): how a Lark person's name is SHOWN — the nickname the organization gives them, else their
    // name, then (optionally) one of their profile fields in parentheses, the way Lark shows it; the vendor name stays the title
    {
      key: 'larkNameField', role: 'nameField', type: 'enum', default: 'department', options: [
        { value: 'none', label: t('Name only') },
        { value: 'department', label: t('Name (department)') },
        { value: 'jobTitle', label: t('Name (job title)') },
      ], label: t('Lark: how people are named'),
      description: t('A person is shown by the nickname your organization gives them, else their name, followed by their department or job title in parentheses when you choose one — the way Lark shows it. Reading profiles needs the sign-in to allow it (the account card says when it does not). A name you set yourself on an author always wins.'),
    },
  ],
};

/** Its integration row (what src/integration-registry.js held under its id) and its own validators. */
function integrationRow({ V, okV, bad }) {
  const larkAppId = (v) => {
    const s = String(v);
    if (!s) return bad('must not be empty');
    if (/\s/.test(s)) return bad('must not contain whitespace');
    if (!/^cli_[A-Za-z0-9]+$/.test(s)) return bad('a Lark App ID starts with cli_ (Developer Console → Credentials & Basic Info)');
    return okV;
  };
  // ── LARK / 飞书 (design §14.2 row 1; consumer lands in P1) ──────────────
  return {
    id: 'lark',
    label: 'Lark / 飞书',
    fields: [
      { key: 'appId', label: i18nKey('App ID'), secret: false, required: true, placeholder: 'cli_…',
        help: i18nKey('Developer Console → Credentials & Basic Info.'), validate: larkAppId },
      { key: 'appSecret', label: i18nKey('App Secret'), secret: true, required: true,
        help: i18nKey('Same page. It is only ever written here, never read back.'), validate: V.minLen(8) },
    ],
    clusterEnv: { json: 'VIBESPACE_INTEGRATIONS', prefix: 'VIBESPACE_INTEGRATION_LARK_' },
    setup: {
      callbackUrl: LARK_CALLBACK_URL,
      callbackNote: i18nKey('Developer Console → Security Settings → Redirect URLs. It must match byte for byte.'),
      prerequisites: [
        i18nKey('The redirect URL above is registered in that list'),
        i18nKey('The scopes im:message and im:message.send_as_user are granted'),
        i18nKey('The app has a PUBLISHED version'),
      ],
    },
    test: {
      kind: 'credential-exchange',
      describe: i18nKey('Exchanges this app id / secret pair for a tenant token once. Reads no conversation, sends no message.'),
      caveat: i18nKey('This only proves the app id / secret pair is right. The consent page also needs the three items above — missing any of them fails on the consent page, not on this call.'),
    },
    consumers: ['src/channels/lark.js'],
    usedBy: i18nKey('Used by the Lark / 飞书 channel'),
    bindsPerAccount: true,
    clientHint: i18nKey('The tenant app this account signs in through. A token is bound to the app it was issued under — switching the app means signing in again.'),
    docs: 'https://open.feishu.cn/document/',
  };
}

module.exports = { kind: 'lark', adapter: 'src/channels/lark.js', settings, integrationRow, LARK_CALLBACK_URL };
