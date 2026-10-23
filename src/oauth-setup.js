'use strict';
/**
 * THE OAUTH SETUP CARD — what a person deploying VibeSpace with their OWN vendor app must do in the vendor's console
 * (lane oauth-setup-instructions, the owner 2026-10-23: «web application 的话，在集群外部署你是不是应该提供一下 redirect uri 有关的
 * instruction，不然用户会懵逼吧»). Before this, a self-hoster met the redirect URIs only in a fold after a refusal — and the
 * refusal itself (Google's «Error 400: redirect_uri_mismatch», Lark's 20029) happens on the vendor's own page, which
 * VibeSpace never sees. PURE: imports only src/consent-road.js (PURE → PURE: the three roads and the verdict). The client
 * (src/lib/oauth-setup-card.js: the Connect dialog's fold, ⚙ → Integrations, the refusal fold) and deploy/README.md
 * (scripts/gen-oauth-setup-doc.mjs) both render THIS model — one source, a test holds the README equal to it.
 *
 *   setupCard(facts) → {kind, who, create, rows, console, refusal, where, now}
 *     facts = {kind, redirect (the registry row's `redirect` block), base (this instance's https base, '' = none),
 *              relayPages ([{url, who: fleet|page}] — a person's own app's relay pages, the kinds digest's), preset
 *              ({key, label, relayPage: url|null, clientType} — the company-preset variant), origin (the page's own
 *              origin: decides which row a sign-in from it uses NOW), clientType ('' | web | desktop: what the account
 *              says its Google client is)}
 *     who     — custom | preset | self (a vendor whose client VibeSpace registers itself: Dropline)
 *     create  — {key: web | desktop | app | preset | self, why: https | relay | local | null, alt: desktop | web | null}:
 *               WHICH client to create. Google (`redirect.clientTypes`): a Web application client whenever this
 *               instance has an https address or a relay page (both are https — a Desktop client can never take one);
 *               a Desktop app client only for a hub whose browser is on the same machine with no relay page (any
 *               127.0.0.1 port, nothing to register). Every other vendor has one kind of app (`app`).
 *     rows    — the EXACT addresses, each {key, uri|null, tpl|null, active, now}. A person's own app (the addendum's
 *               three ways back, 主开发 2026-10-23 12:24Z): ① `public` — the project's public relay page (free, no
 *               account; it sends a browser back only to a private address — a public https name is shown the code,
 *               never redirected), ② `own` — their own copy of docs/slack-relay (data-allow = their domain), ③ `route`
 *               — this instance's own https address (no relay); on a fleet pod the fleet's page (`fleet`) stands for
 *               ① and ② (the fleet's page outranks the setting); + `loopback` — the kind's FIXED 127.0.0.1 callback
 *               (Lark's; Gmail's for a Web client) for a browser on this machine; + `also` rows (Drive's rclone port).
 *               A company preset: its relay page (`preset`), else this instance's own address (`presetRoute`) — the
 *               public page is NEVER a preset's row (addendum 1 of lane oauth-relay-road).
 *     now     — {road, uri, key} — consentRoad's verdict for THIS page (null without an origin): the row it marks.
 *   docSection(rows) → the markdown deploy/README.md holds between DOC_BEGIN / DOC_END (scripts/gen-oauth-setup-doc.mjs).
 *   PUBLIC_RELAY — the project's public relay page: a DOCUMENTED, STABLE contract (README, the card, the relay page's
 *                  published path) — scripts/test-integration-registry.mjs pins it.
 *
 * Words are English KEYS (`WORDS`, i18nKey) the client renders with t() and the README prints as they are.
 */

const CR = require('./consent-road.js');   // PURE → PURE: the three roads (relay › route › loopback), the landing route's base path

const i18nKey = (s) => s;
const PUBLIC_RELAY = CR.RELAY_DEFAULT;   // the setup card's ① row (a person's own app only) — the page published from docs/slack-relay
const ROW_KEYS = Object.freeze(['fleet', 'public', 'own', 'route', 'loopback', 'preset', 'presetRoute', 'also']);
const CLIENT_TYPES = Object.freeze(['web', 'desktop']);
const HOST_TPL = 'https://<host>';

/** THE WORDS — one table, the card's and the README's. `{provider}` = the sign-in brand, `{kind}` = the account type. */
const WORDS = Object.freeze({
  title: i18nKey('Your own {provider} app: what to create and which addresses to register'),
  fold: i18nKey('Setting up your own {provider} app? What to create and the exact addresses to register'),
  'title.self': i18nKey('Signing in with {provider}: nothing to set up in a console'),
  'create.web': i18nKey('Create a Web application OAuth client.'),
  'create.desktop': i18nKey('Create a Desktop app OAuth client: it takes any 127.0.0.1 port, so there is no address to register.'),
  'create.preset': i18nKey('This company app is your admin’s: nothing to create, and its addresses are registered by your admin.'),
  'create.self': i18nKey('Nothing to create and nothing to register: VibeSpace registers its own {provider} client the first time you connect.'),
  'why.https': i18nKey('Why: this VibeSpace has an https address ({host}), and only a Web application client can take one.'),
  'why.relay': i18nKey('Why: a sign-in here comes back through a relay page (an https address), and only a Web application client can take one.'),
  'why.local': i18nKey('Why: the browser is on the VibeSpace machine and no relay page or https address is used.'),
  'alt.desktop': i18nKey('Only ever sign in on the VibeSpace machine itself? A Desktop app client works too: choose “Desktop app” as the account’s OAuth client type — nothing to register.'),
  'alt.web': i18nKey('A Web application client works here too: register the 127.0.0.1 address below and choose “Web application” as the account’s OAuth client type.'),
  'said.desktop': i18nKey('This account says its client is a Desktop app, so it signs in at 127.0.0.1 — from another computer, paste the last page’s address back.'),
  register: i18nKey('Register the ones you use, each exactly as written, under {path}:'),
  'row.fleet': i18nKey('This fleet’s relay page — every VibeSpace of the fleet signs in through it.'),
  'row.public': i18nKey('① VibeSpace’s public relay page — free, no account. It sends the browser back only to a private address (this machine, your network, Tailscale); a public https name is shown the code instead, so it is never an open redirect.'),
  'row.own': i18nKey('② Your own copy of the relay page (Settings → Channels → relay page).'),
  'row.own.tpl': i18nKey('② Or host your own copy: the two static files in docs/slack-relay on any https host, with data-allow set to your domain — register its address and enter it in Settings → Channels → relay page.'),
  'row.route': i18nKey('③ This VibeSpace’s own https address — used when you open VibeSpace from another computer; no relay needed.'),
  'row.route.tpl': i18nKey('③ If this VibeSpace has its own https address, register https://<host>/api/channels/oauth/cb/{kind} — no relay needed.'),
  'row.loopback': i18nKey('This machine: used when the browser runs on the VibeSpace machine itself and no relay page is set, and by “Sign in the other way”.'),
  'row.loopback.web': i18nKey('This machine, with a Web application client: used when the browser runs on the VibeSpace machine itself and no relay page is set, and by “Sign in the other way”.'),
  'row.preset': i18nKey('This company app’s relay page — registered once by your admin.'),
  'row.presetRoute': i18nKey('This company app has no relay page yet: this VibeSpace’s own address must be on the app — your admin adds it.'),
  'row.presetRoute.tpl': i18nKey('This company app has no relay page yet, and this VibeSpace has no https address: a sign-in comes back only on this machine, or by pasting the last page’s address back.'),
  'row.also.drive': i18nKey('A Google Drive folder (storage) signs in with the same client at this address.'),
  'row.self': i18nKey('The address VibeSpace registers for it — where {provider} sends you back.'),
  now: i18nKey('used now'),
  inactive: i18nKey('Not set here: enter it in Settings → Channels → relay page to use it.'),
  'now.ephemeral': i18nKey('A sign-in from this page comes back to 127.0.0.1 on any free port (a Desktop app client).'),
  last: i18nKey('If a sign-in still does not come back, the Connect dialog finishes it: paste the last page’s address into its fold.'),
  'where.custom': i18nKey('Then: Connect an account → OAuth client → Custom — enter the client ID and secret there.'),
  'where.preset': i18nKey('The client ID and secret are set by your admin in the cluster presets.'),
  'where.self': i18nKey('The client id is filled in by Connect.'),
  refusal: i18nKey('If {provider} says “{error}”, the address it was sent is not on that list: add it there (for a company app, your admin does).'),
  'refusal.desktop': i18nKey('An https address and {provider} still says “{error}”? The client is a Desktop app client, which cannot take one — create a Web application client, or sign in the other way.'),
  console: i18nKey('Open the console'),
});

/** deploy/README.md's own words (scripts/gen-oauth-setup-doc.mjs — English only, never drawn in the product). */
const DOC_WORDS = Object.freeze({
  'doc.clientTypes': ('Create a **Web application** client when this VibeSpace has an https address or uses a relay page (both are https addresses, which a Desktop client can never take); a **Desktop app** client only when the browser runs on the VibeSpace machine itself and no relay page is used — it takes any 127.0.0.1 port, nothing to register.'),
  'doc.clientType': ('Say which kind it is: a company client with `"clientType": "web"` or `"desktop"` in its gdrive-clients.json entry, a person’s own client with the account’s OAuth client type. A Web client signs in on this machine at the fixed address below; a Desktop client never rides a relay page.'),
  'doc.where': ('The client ID and secret: a person’s own app in Connect an account → OAuth client → Custom; a company app in the cluster presets (above).'),
});

const hostOf = (u) => { try { return new URL(String(u)).host; } catch { return ''; } };

/** WHICH client to create (Google's two kinds; every other vendor its one app). */
function createOf({ redirect, base, relay, here, preset, self }) {
  if (self) return { key: 'self', why: null, alt: null };
  if (preset) return { key: 'preset', why: null, alt: null };
  if (!(redirect && redirect.clientTypes)) return { key: 'app', why: null, alt: null };
  if (base || relay) return { key: 'web', why: base ? 'https' : 'relay', alt: here ? 'desktop' : null };
  return { key: 'desktop', why: 'local', alt: redirect.loopback ? 'web' : null };
}

/** The setup card's model for ONE account kind on THIS instance (header). */
function setupCard({ kind, redirect = null, base = '', relayPages = [], preset = null, origin = null, clientType = '' } = {}) {
  const r = redirect && typeof redirect === 'object' ? redirect : {};
  const self = !!r.selfRegisters;
  const route = base ? `${base}${CR.CALLBACK_BASE}${kind}` : null;
  const tpl = `${HOST_TPL}${CR.CALLBACK_BASE}${kind}`;
  const pages = (Array.isArray(relayPages) ? relayPages : []).filter((p) => p && typeof p.url === 'string' && p.url);
  const fleet = pages.find((p) => p.who === 'fleet') || null;
  const page = fleet ? null : (pages.find((p) => p.who === 'page') || null);
  const here = CR.loopbackOrigin(origin);
  const ct = CLIENT_TYPES.includes(clientType) ? clientType : '';
  const rows = [];
  const row = (key, uri, extra = {}) => rows.push({ key, uri: uri || null, tpl: null, active: false, now: false, ...extra });
  if (self) {
    if (route) row('route', route);
  } else if (preset) {
    if (preset.relayPage) row('preset', preset.relayPage); else row('presetRoute', route);
  } else {
    if (fleet) row('fleet', fleet.url, { active: true });
    else {
      row('public', PUBLIC_RELAY, { active: !!page && page.url === PUBLIC_RELAY });
      if (page && page.url !== PUBLIC_RELAY) row('own', page.url, { active: true }); else row('own', null);
    }
    row('route', route, route ? {} : { tpl });
  }
  // the FIXED loopback: a company app with a relay page sends every instance through it (no loopback row); a Desktop
  // client takes any port (nothing to register)
  if (!self && r.loopback && !(preset && preset.relayPage) && (!r.clientTypes || ct !== 'desktop')) row('loopback', r.loopback, { web: !!r.clientTypes });
  if (!self && !preset) for (const a of r.also || []) row('also', a.uri, { for: a.for });
  // NOW: what a sign-in from this page takes — the consent road's own verdict (a Slack-shaped kind: its relay, else the route)
  let now = null;
  if (origin && !self) {
    const relay = preset ? (preset.relayPage ? { url: preset.relayPage, fleet: true } : { url: '', fleet: false }) : fleet ? { url: fleet.url, fleet: true } : { url: page ? page.url : '', fleet: false };
    if (r.loopback) {
      const v = CR.consentRoad({ kind, publicUrl: base, origin, relayUrl: relay.url, relayFleet: relay.fleet, clientType: r.clientTypes ? ct : 'web' });
      now = v.road === 'loopback' ? (v.fixed ? { road: 'loopback', uri: r.loopback } : { road: 'loopback', uri: null }) : { road: v.road, uri: v.redirectUri };
    } else if (relay.url) now = { road: 'relay', uri: relay.url };
    else if (route) now = { road: 'route', uri: route };
    if (now && now.uri) for (const x of rows) if (x.uri === now.uri) { x.now = true; now.key = x.key; break; }
  }
  const relayUsed = preset ? !!preset.relayPage : pages.length > 0;
  return {
    kind,
    who: self ? 'self' : preset ? 'preset' : 'custom',
    create: createOf({ redirect: r, base, relay: relayUsed, here, preset: !!preset, self }),
    host: hostOf(base),
    clientType: ct || null,
    clientTypes: !!r.clientTypes,
    appWords: r.create || null,   // the row's own words for its one kind of app (`create.key === 'app'`)
    rows,
    console: r.console ? { path: r.console.path, links: (r.console.links || []).slice() } : null,
    refusal: r.refusal || null,
    where: self ? 'self' : preset ? 'preset' : 'custom',
    now,
  };
}

/** The words of one row (the key the client t()s; params beside it). */
function rowWords(x) {
  if (x.key === 'own') return x.uri ? WORDS['row.own'] : WORDS['row.own.tpl'];
  if (x.key === 'route') return x.uri ? WORDS['row.route'] : WORDS['row.route.tpl'];
  if (x.key === 'loopback') return x.web ? WORDS['row.loopback.web'] : WORDS['row.loopback'];
  if (x.key === 'presetRoute') return x.uri ? WORDS['row.presetRoute'] : WORDS['row.presetRoute.tpl'];
  if (x.key === 'also') return WORDS[`row.also.${x.for}`] || '';
  return WORDS[`row.${x.key}`] || '';
}

const DOC_BEGIN = '<!-- oauth-setup:begin — GENERATED from the registry rows\' `redirect` blocks by scripts/gen-oauth-setup-doc.mjs (src/oauth-setup.js; test-integration-registry holds it equal): edit the words there, never here -->';
const DOC_END = '<!-- oauth-setup:end -->';
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));

/** deploy/README.md's block: per kind (`entries` = [{kind, provider, redirect}] in registry order), the card a self-hoster
 *  meets on an instance with an https address `<host>` and the default relay setting (the public page). */
function docSection(entries) {
  const out = [DOC_BEGIN, ''];
  for (const { kind, provider, label, redirect } of entries) {
    const card = setupCard({ kind, redirect, base: HOST_TPL, relayPages: [{ url: PUBLIC_RELAY, who: 'page' }] });
    const p = { provider, kind, host: '<host>', path: card.console ? card.console.path : '', error: card.refusal || '' };
    out.push(`#### ${label}`, '');
    if (card.create.key === 'self') { out.push(`- ${fill(WORDS['create.self'], p)}`, `- \`${card.rows[0] ? card.rows[0].uri : `${HOST_TPL}${CR.CALLBACK_BASE}${kind}`}\` — ${fill(WORDS['row.self'], p)}`, ''); continue; }
    if (redirect.clientTypes) out.push(`- ${DOC_WORDS['doc.clientTypes']}`, `- ${DOC_WORDS['doc.clientType']}`);
    else out.push(`- ${fill(redirect.create || '', p)}`);
    const links = card.console && card.console.links.length ? ` (${card.console.links.map((l) => `<${l.url}>`).join(', ')})` : '';
    out.push(`- ${fill(WORDS.register, p).replace(/:$/, `${links}:`)}`);
    for (const x of card.rows) out.push(`  - ${x.uri ? `\`${x.uri}\` — ` : ''}${fill(rowWords(x), p)}`);
    out.push(`- ${DOC_WORDS['doc.where']}`);
    if (card.refusal) out.push(`- ${fill(WORDS.refusal, p)}${redirect.clientTypes ? ` ${fill(WORDS['refusal.desktop'], p)}` : ''}`);
    out.push(`- ${WORDS.last}`, '');
  }
  out.push(DOC_END);
  return out.join('\n');
}

module.exports = { PUBLIC_RELAY, ROW_KEYS, CLIENT_TYPES, HOST_TPL, WORDS, DOC_BEGIN, DOC_END, setupCard, rowWords, docSection };
