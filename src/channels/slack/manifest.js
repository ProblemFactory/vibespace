'use strict';
// src/channels/slack/manifest.js — SLACK'S MANIFEST (lane dc-channels-manifest — rv-channels-core C3/C4, rv-channel-adapters
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
const { RELAY_DEFAULT } = require('../slack-manifest.js');   // PURE: the relay page's default (the consent row's fallback too)

// Slack (design 012, lane S1): each person's OWN internal app — Slack meters every method on its own (history 50 a
// minute, reactions.remove 20, users.info 100 — the adapter's per-method buckets, src/channels/slack-limits.js); this
// is the account's whole minute across them: 40 (a fifth of the four busiest methods' floors), 2 a second
const settings = {
  vendor: 'slack', vendorName: t('Slack'),
  rows: [
    {
      key: 'budgetSlackPerMin', role: 'budget', type: 'number', default: 40, min: 5, max: 300, step: 5,
      label: t('Slack: requests per minute per account'),
      description: t('Slack limits every method on its own (reading a conversation\'s history: 50 a minute for your own app). This is the account\'s whole minute across all of them; when an account reaches it, its refreshes wait for the next minute and the account card says so.'),
    },
    {
      key: 'slackRequestsPerSec', role: 'pace', type: 'number', default: 2, min: 1, max: 20, step: 1,
      label: t('Slack: requests per second per account'),
      description: t('Requests are spread evenly: at most this many a second, and never faster than the per-minute budget above allows.'),
    },
  ],
  options: [
    // design 018: the relay page a workspace Slack app typed into THIS instance sends members back through (a company
    // preset names its own relayUrl). The default is the project's own static page; empty = this instance's own https
    // address, else the member pastes the code the app's page shows. Read by the hub (serverSetting).
    {
      key: 'slackRelayUrl', role: 'relayUrl', type: 'string', default: RELAY_DEFAULT,
      label: t('Slack: relay page'),
      description: t('The https page Slack sends a member back to after they press Allow, for a workspace app whose Client ID and Secret were typed here (a company preset names its own). The page only returns the browser to a VibeSpace on a private network; anywhere else it shows the code to paste back. Register the same address under the app’s Redirect URLs. Empty = this instance’s own https address, else the code is pasted back.'),
      tier: 'advanced',
    },
  ],
};

/** Its integration row (what src/integration-registry.js held under its id) and its own validators. */
function integrationRow({ V, okV, bad }) {
  const slackClientId = (v) => {
    const s = String(v);
    if (!s) return bad('must not be empty');
    if (/\s/.test(s)) return bad('must not contain whitespace');
    if (!/^\d{3,20}\.\d{3,20}$/.test(s)) return bad('a Slack Client ID is two runs of digits joined by a dot (Basic Information → App Credentials)');
    return okV;
  };
  /** design 018: an https page address, or empty (empty = no relay: the member pastes the code back). */
  const httpsUrlOrEmpty = (v) => {
    const s = String(v);
    if (!s) return okV;
    if (/\s/.test(s)) return bad('must not contain whitespace');
    if (!/^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?(\/[^?#]*)?$/i.test(s) || s.length > 300) return bad('must be an https URL (Slack redirects only to https)');
    return okV;
  };
  /** design 018: a Slack workspace's subdomain (`acme` of acme.slack.com), or empty. */
  const slackTeamDomain = (v) => (/^([a-z0-9][a-z0-9-]{0,61})?$/i.test(String(v)) ? okV : bad('the workspace\'s subdomain, e.g. acme for acme.slack.com'));
  // ── SLACK — ONE APP PER WORKSPACE + the PASTE rung (design 012 lane S1; design 017; design 018) ──
  // THREE RUNGS, the Lark stored / custom shape plus Slack's own: (1) a CLUSTER PRESET ("stored": the company's
  // workspace app — client id, secret, the relay page on the fleet's admin host, the workspace's subdomain; the
  // members press Allow); (2) a CUSTOM client ("custom": the id / secret of the person's own workspace app, typed in the
  // account dialog; its relay page is the `channels.slackRelayUrl` setting); (3) no client (`signin: 'paste'`): each
  // person's own app made with a one-time setup token, and the pasted User OAuth Token — the engine answers every
  // credential question of a key-less account as ready (`source: 'paste'`). Slack redirects only to https: the
  // redirect is the relay page, or the instance's own https origin + /api/channels/oauth/cb/slack (slack-manifest.js
  // `redirectFor`) — never a literal here.
  return {
    id: 'slack',
    label: 'Slack',
    fields: [
      { key: 'clientId', label: i18nKey('Client ID'), secret: false, required: true, placeholder: '1234567890.1234567890',
        help: i18nKey('The workspace app’s Basic Information page → App Credentials.'), validate: slackClientId },
      { key: 'clientSecret', label: i18nKey('Client Secret'), secret: true, required: true,
        help: i18nKey('Same page. It is only ever written here, never read back.'), validate: V.minLen(8) },
      { key: 'relayUrl', label: i18nKey('Relay page'), secret: false, required: false, placeholder: 'https://…',
        help: i18nKey('The https page Slack sends members back to; it returns them to their own VibeSpace. Empty = this instance’s own https address, else the code is pasted back.'), validate: httpsUrlOrEmpty },
      { key: 'teamDomain', label: i18nKey('Workspace'), secret: false, required: false, placeholder: 'acme',
        help: i18nKey('The workspace’s subdomain (acme for acme.slack.com) — the name the connect card shows.'), validate: slackTeamDomain },
    ],
    signin: 'paste',
    // lane dc-channels-consent (F3): THE PASTE STEPS' WORDS AND FACTS — the account dialog (src/lib/channel-account-dialogs.js)
    // is their renderer and names no vendor: the steps, the app page, the remembered app id's shape, the app field's
    // label and notes, every refusal by its closed `why`. appPage / appIdShape = slack-manifest.js CONFIG_PAGE / APP_ID_RE.
    paste: {
      appPage: 'https://api.slack.com/apps',
      appIdShape: '^A[A-Z0-9]{8,}$',
      fieldLabel: i18nKey('Slack app'),
      steps: [
        i18nKey('1. Press “Connect {label}” — Slack opens a page that makes your own app (pick your workspace, press Create).'),
        i18nKey('2. Press “Install to Workspace”, then Allow.'),
        i18nKey('3. Copy the User OAuth Token (it starts xoxp-) from “OAuth & Permissions” and paste it in the box below.'),
        i18nKey('Your workspace admin may have to approve the app; your company’s data policy comes first. The token stays on this server, sealed.'),
      ],
      notes: {
        custom: i18nKey('Slack opens its Allow page; press Allow and you are connected. The app must list the relay page (Settings → Channels → Slack relay page) under OAuth & Permissions → Redirect URLs.'),
        preset: i18nKey('Your workspace’s app: press Connect, then Allow on Slack’s page — nothing to copy.'),
        switchBack: i18nKey('Switching to the workspace app keeps this account; the app you made yourself stays in Slack — remove it at api.slack.com/apps if you no longer need it.'),
      },
      box: { placeholder: i18nKey('the code, or xoxp-…'), hint: i18nKey('If Slack’s last page shows a code instead of coming back here, paste the code below. For your own app: paste its User OAuth Token (it starts xoxp-).') },
      words: {
        step1: i18nKey('Get a one-time setup token'),
        openConfig: i18nKey('Open Slack’s app page'),
        step1Hint: i18nKey('At the bottom of that page, under “Your App Configuration Tokens”, press Generate Token, pick your workspace and copy the token that starts xoxe. — paste it below. It stops working by itself after 12 hours; VibeSpace uses it once and keeps nothing.'),
        vendorApp: i18nKey('Generating a token adds Slack’s own “Slack Tooling Tokens Vendor” app to your workspace.'),
        create: i18nKey('Create the app'),
        creating: i18nKey('Making the app in Slack…'),
        pasteSetupFirst: i18nKey('Paste the setup token first (it starts xoxe.xoxp-).'),
        step2: i18nKey('Install it in your workspace'),
        openInstall: i18nKey('Open the install page'),
        step2Hint: i18nKey('Press “Install to Workspace”, then “Allow”. Once installed, the same page shows the “User OAuth Token” (it starts xoxp-) near the top — copy it.'),
        approval: i18nKey('If your workspace needs an admin’s approval, the Install button appears on that page only after they approve; VibeSpace remembers the app you made.'),
        step3: i18nKey('Paste the token and connect'),
        step3Hint: i18nKey('Paste the User OAuth Token (it starts xoxp-) here, then press Connect below.'),
        pasteUserFirst: i18nKey('Paste the User OAuth Token in step 3 first (it starts xoxp-).'),
        fallback: i18nKey('Another way: make the app yourself in Slack'),
        openLink: i18nKey('Open the create link'),
        copySetup: i18nKey('Copy app setup'),
        copied: i18nKey('App setup copied'),
        copyFailed: i18nKey('Could not copy — open the create link instead.'),
        clicks: i18nKey('Open the link → if a “Create new app” chooser appears, pick “From a manifest” and paste the copied setup → pick your workspace → Create → Install to Workspace → Allow → copy the User OAuth Token and paste it in step 3.'),
        finePrint: i18nKey('Your workspace admin may have to approve the app; your company’s data policy comes first. The token stays on this server, sealed.'),
        another: i18nKey('Make another app'),
        made: i18nKey('Made the app “{app}” in {team}.'), madeNoTeam: i18nKey('Made the app “{app}”.'),
        madeAnother: i18nKey('This is another app — the earlier “{prev}” stays in Slack; remove it there if you do not need it.'),
        makesAnother: i18nKey('This makes another app in Slack — you already made “{app}”.'),
      },
      whys: {
        'user-token-wrong-box': i18nKey('That is the User OAuth Token (xoxp-) — paste it in step 3. This box takes the setup token (xoxe.).'),
        'config-token-wrong-box': i18nKey('That is the setup token (xoxe.) — paste it in step 1. This box takes the User OAuth Token (xoxp-).'),
        'refresh-token-not-config': i18nKey('That is the refresh token (xoxe-) — copy the token above it on the same page (it starts xoxe.xoxp-).'),
        'not-a-config-token': i18nKey('That is not a setup token — copy the one under “Your App Configuration Tokens” (it starts xoxe.xoxp-).'),
        'not-a-user-token': i18nKey('That is not a User OAuth Token — copy the one that starts xoxp- from the install page.'),
        'config-token-expired': i18nKey('Slack refused the setup token — it has expired or was revoked. Generate a new one and paste it.'),
        'config-token-scope': i18nKey('That token cannot make apps — paste the token from “Your App Configuration Tokens”.'),
        'rate-limited': i18nKey('Slack asked to slow down — try again in a minute.'),
        'transport': i18nKey('Slack did not answer — try again.'),
        'token-invalid': i18nKey('Slack refused that token — copy the User OAuth Token again from the install page.'),
        'token-revoked': i18nKey('Slack refused that token — copy the User OAuth Token again from the install page.'),
        'app-create-refused': i18nKey('Slack did not create the app.'),
      },
      whysWithCode: { 'app-create-refused': i18nKey('Slack did not create the app ({code}).') },
    },
    clusterEnv: { json: 'VIBESPACE_INTEGRATIONS', prefix: 'VIBESPACE_INTEGRATION_SLACK_' },
    setup: {
      callbackNote: i18nKey('Slack → your app → OAuth & Permissions → Redirect URLs: add the relay page (or this instance’s https address + /api/channels/oauth/cb/slack). It must match exactly or be a sub-path.'),
      prerequisites: [
        i18nKey('The relay page (or this instance’s https callback) is registered under Redirect URLs'),
        i18nKey('The app asks for the user scopes VibeSpace lists (node scripts/slack-manifest.mjs prints the whole manifest)'),
      ],
    },
    test: {
      kind: 'shape-only',
      describe: i18nKey('Checks the client id / secret shape (Slack has no exchange that proves a secret alone) and, for the paste rung, each pasted value by its shape first: a one-time setup token (xoxe.) makes your own app with one apps.manifest.create request and is not kept; the user token (xoxp-) costs one request that asks Slack who it belongs to.'),
      caveat: i18nKey('Shape only. Whether the consent succeeds depends on the redirect URL and scopes registered on the app; whether the token reads every conversation depends on the scopes it was installed with — the account card lists them.'),
    },
    consumers: ['src/channels/slack.js'],
    usedBy: i18nKey('Used by the Slack channel'),
    bindsPerAccount: true,
    clientHint: i18nKey('A workspace app lets every member just press Allow; without one, make your own Slack app with a one-time setup token.'),
    docs: 'docs/agent/channels-manual.md',
  };
}

module.exports = { kind: 'slack', adapter: 'src/channels/slack.js', settings, integrationRow };
