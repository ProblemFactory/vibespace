#!/usr/bin/env node
// THE CONSENT ROAD (lane pod-oauth-callback, 2026-10-23 — two naive-user studies on fleet pods, study 2 B2 + study 1 L1:
// every Lark / Gmail connect from a pod sent the browser back to the POD's own 127.0.0.1, an address no person's browser
// reaches; the only road was a box asking for the failed page's address — nobody walked it). Fast, in-process, ZERO vendor
// calls: the vendors are a LOOPBACK FAKE (an http server on 127.0.0.1 answering the documented Lark and Google shapes;
// the adapters' own fetch is pointed at it). What is measured:
//   ① PURE src/consent-road.js — the verdict table (an https address + a browser elsewhere → the instance's route; a
//      browser on this machine, no address, an http address, the person's own `road: 'loopback'` → the loopback), the
//      signed state (round trip, another boot's HMAC, another kind, the age, a tampered clear part), the landing page
//      (three languages, escaped, the close script on a connected page only)
//   ② the REAL channels engine + the REAL routes/channels.js over the REAL integration store (a company Lark preset that
//      names its brand, a Google drive preset): Connect Lark from a pod — the consent names Lark INTERNATIONAL (the
//      preset's brand) and redirect_uri = https://<pod>/api/channels/oauth/cb/lark, nothing listens; the browser lands on
//      the route — the page says connected and carries the ONE script the route's CSP allows by hash; the fake vendor saw
//      the exchange with exactly that redirect; the flow is done, Connect makes the account (brand lark); a replay is
//      refused. The same for Gmail (Google's shapes).
//   ③ the loopback stays the road of a local hub: a browser on this machine, an instance with no address or an http one,
//      and the person's own other road — Lark's FIXED callback (listening), Gmail's EPHEMERAL port
//   ④ the preset's brand is the default only: a brand the dialog sent wins; the kinds digest names the route a custom app
//      registers (`consentRoute`, null without an https address)
//   ⑤ the chat's Connect row: connectOffer / connectOffers / connectTaught (the 'connect' reach word) before and after an
//      account exists; an unknown type answers the types
//   ⑥ RED CONTROLS (mutant copies): the BASE adapters (the route never taken) ⇒ redirect_uri is 127.0.0.1 — red on ②'s
//      route; a verdict that ignores the browser's origin ⇒ red on ③'s local browser; a route without the script hash ⇒
//      the page's close script would be blocked — red on ②'s CSP
// lane oauth-relay-road (the owner, 2026-10-22: «不可能每次都让我手动加 redirect url 的：集群里用 admin 做转发，其他地方用我那个
// githubio» — the route meant one registered address per POD):
//   ① + THE RELAY ROWS: a pod with the fleet's relay ⇒ the relay (u = the pod); a pod with only the public page ⇒ the
//      route (the page would only SHOW the code); a pod with none ⇒ the route; a local hub with the public page ⇒ the
//      relay (u = its loopback origin, the bound port in it); a LAN origin ⇒ the relay; a hub with its own https and no
//      relay ⇒ the route; the order relay › route › loopback (the person's own road beats every relay); relayPick /
//      relayOf (the fleet's › the preset's › the setting's; a preset's only for a preset account)
//   ⑦ THE REAL ENGINE THROUGH THE REAL RELAY PAGE (docs/slack-relay/relay.js `decide`, run as shipped in a vm): a fleet
//      pod's Lark (the deprecated env VIBESPACE_OAUTH_RELAY_URL — read by the store for one release; ⑩ the presets road;
//      the admin copy's data-allow = the fleet's domain) and a local hub's Gmail and
//      Lark (the public page, data-allow empty) — redirect_uri = the relay page, the page sends the browser to
//      <u>/api/channels/oauth/cb/<kind> with the vendor's query VERBATIM, the landing says connected, the fake vendor saw
//      the exchange with the relay page as its redirect; a preset's own relay page (Lark JSON entry, a Google drive
//      preset); the kinds digest's `relayPages` (the addresses an app registers ONCE)
//   ⑥ + RED CONTROL = 2c22424d (the relay never asked: a pod registers one address per pod) — red on ⑦'s fleet leg; a
//      verdict that takes any configured relay ⇒ a pod rides the public page, which only shows the code — red on ①
// lane oauth-setup-instructions (the owner 2026-10-23: a self-hoster's own Google client — a Web application or a Desktop
// app — and the redirect URIs it must register):
//   ① + a Desktop client's row (`desktop-client`: never the relay page, never the route)
//   ⑨ the verdict with a client kind (Desktop ⇒ the loopback on any port; Web ⇒ the relay / the route / the FIXED
//      loopback); Gmail's clientType option › its preset's; the adapter alone (a stub loopback records what it binds);
//      THE REAL ENGINE with a Web company client: the fixed address, Google's redirect to it, the exchange byte for
//      byte, the account's option, the digest's `oauthSetup`; the dialog's «Desktop app» ⇒ the ephemeral port; THE
//      SETUP CARD's exact addresses per instance (local hub on the public page / no relay / its own https / a fleet
//      pod / a company preset with and without a page / Slack / Dropline) — the public page never a preset's row; the
//      public page's address pinned; RED CONTROL = c8aa8820 (the kind never asked: a Desktop client rides the relay)
// ADDENDUM 1 (the owner, 2026-10-22: «github 那个 url 不能加到我们公司的 lark 和 slack app 默认配置里» — the public page is never part
// of a company app's configuration):
//   ① relayPick / relayOf: a company preset rides its own page › the fleet's, else NO relay — the setting (the public
//      page's home) is never even read for it; a person's own app the fleet's › the setting's. A preset WITH a page rides
//      it on a pod AND on a local hub; WITHOUT ⇒ the route / the loopback
//   ⑦ the real engine: a local hub's company presets (no page named, the setting at the public page) take Lark's
//      registered loopback and Gmail's ephemeral port — the public page's round trip is a CUSTOM client's; a preset's
//      own page on a pod (with and without the fleet's: its own outranks); the digest's presets[].relayPage (the
//      cluster's page, or null = «no relay page yet»)
//   ⑧ THE CENSUS (grep-derived over src/): the public page's host lives only in slack-manifest.js's RELAY_DEFAULT (the
//      custom setting's default) and EGRESS (a custom app's browser visits it); every RELAY_DEFAULT reference is a
//      custom-app role (the setting's default, a consent row's setting fallback, the custom setup's words) or a comment;
//      no registry row's relayUrl field defaults to it
//   ⑥ + RED CONTROL = 8725b131 (a preset falls through to the setting: fleet › preset › setting) — the preset on the
//      local hub rides the PUBLIC page — red on ① and ⑦'s hub preset leg
// lane oauth-relay-one-source (the owner 2026-10-23: «你为啥搞了两套分发 auth client 的方案» — the Google client rows were presets
// FILES, live; the relay page a chart ENV, at restart: a pod never restarted got the new rows and no relay ⇒ Google's
// redirect_uri_mismatch):
//   ⑩ ONE SOURCE, the REAL engine + store + presets reader (a scratch directory): the fleet's page from fleet.json (Lark,
//      Gmail, the digest's relayPages / presets[].relayPage); a fleet.json edit reaches the NEXT Connect with no restart
//      (the journal says «relay page changed»); fleet.json › the deprecated env (said once at boot, by its exact words)
//      › none; the release's override/fleet.json wins over the cluster's, its '' = none even with the env set; a preset's
//      own relayUrl wins over both. RED CONTROL = ffc8b1ff (the engine reading the env): the presets carry the page, the
//      env does not ⇒ Gmail's consent names the POD's own route — the incident, reproduced
// lane oauth-landing-words (the owner 2026-10-23 14:3x PT: 「这个提示里为啥把 email 打码了」 — Cloudflare's Email Address
// Obfuscation rewrote the address on the hub's landing into «[email protected]» and the CSP blocked its decoder — + B-24d8:
// three languages stacked, «(expired)» for a cancelled or replaced sign-in):
//   ⑪ PURE — landingLang (a 27-row Accept-Language table + PARITY with the shipped src/lib/i18n.js resolveLang over each
//      browser's navigator.language); one paragraph per page in one language, never the other two; landingUser (escaped,
//      `&#64;`, inside <!--email_off--> … <!--/email_off-->) — nothing Cloudflare's pattern matches, in any language; a
//      verdict × language matrix (each its own sentence, none of the others'); RED CONTROLS = the bare print (the base),
//      every refusal reading «expired», a language-deaf page
//   ⑪ the REAL engine + routes — Google from a ja browser (the mailbox marked, Vary), Lark from zh, a cancelled
//      Re-authorize (zh), the first of two presses (ja), no language (en), a state from before a restart (en)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CR = require(path.join(REPO, 'src/consent-road.js'));
const OL = require(path.join(REPO, 'src/oauth-loopback.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const STORE = require(path.join(REPO, 'src/server/integration-store.js'));
const RT = require(path.join(REPO, 'src/routes/channels.js'));
const express = require(path.join(REPO, 'node_modules/express'));
const MUT = mutantCopies('consent-road', REPO);
const ROOT = scratch('consent-road');
fs.mkdirSync(ROOT, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? `\n    ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`.slice(0, 900) : ''}`); } };
const quiet = { log() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POD = 'https://pod-road.example.test';
const ROUTE_LARK = `${POD}/api/channels/oauth/cb/lark`;
const ROUTE_GMAIL = `${POD}/api/channels/oauth/cb/gmail`;
const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sign = (clear) => crypto.createHmac('sha256', 'consent-road-suite').update(String(clear)).digest('base64url');
// lane oauth-relay-road: the relay pages (the fleet's admin copy, the project's public page) + the page itself, as shipped
const FLEET = 'https://alice.fleet.example.test', ADMIN_RELAY = 'https://admin.fleet.example.test/relay/', PUBLIC_RELAY = CR.RELAY_DEFAULT;
const CO_RELAY = 'https://co.example.test/r/';   // addendum 1: a company preset's own page (the cluster admin's)
const PRESET = (values) => ({ source: 'cluster', values });
const vm = await import('node:vm');
const relayPage = (() => { const c = { URL, URLSearchParams, atob }; c.globalThis = c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(REPO, 'docs/slack-relay/relay.js'), 'utf8'), c); return c.VibeSpaceRelay; })();
/** The vendor sends the browser to the relay page with `query`; the page (relay.js decide, `allow` = its data-allow) answers. */
const throughRelay = (consentUrl, query, allow) => { const u = new URL(consentUrl); return relayPage.decide(`?${query}&state=${encodeURIComponent(u.searchParams.get('state'))}`, allow); };

// ── ① PURE ──
console.log('① PURE src/consent-road.js');
{
  const R = (o) => CR.consentRoad(o);
  const route = R({ kind: 'lark', publicUrl: POD, origin: POD });
  ok(route.road === 'route' && route.redirectUri === ROUTE_LARK && route.base === POD && route.why === 'https-address', 'an https address + a browser on it ⇒ the instance\'s route, /api/channels/oauth/cb/<kind>', route);
  ok(R({ kind: 'gmail', publicUrl: 'https://h.example.test/vs/', origin: 'https://h.example.test' }).redirectUri === 'https://h.example.test/vs/api/channels/oauth/cb/gmail', 'an address under a path keeps the path, no trailing slash');
  ok(R({ kind: 'lark', publicUrl: POD, origin: null }).road === 'route', 'no origin told (an API caller) ⇒ the route');
  const rows = [
    [{ kind: 'lark', publicUrl: POD, origin: 'http://127.0.0.1' }, 'local-browser'],
    [{ kind: 'lark', publicUrl: POD, origin: 'http://localhost' }, 'local-browser'],
    [{ kind: 'lark', publicUrl: POD, origin: 'http://[::1]' }, 'local-browser'],
    [{ kind: 'lark', publicUrl: POD, origin: 'http://dev.localhost' }, 'local-browser'],
    [{ kind: 'lark', publicUrl: '', origin: POD }, 'no-address'],
    [{ kind: 'lark', publicUrl: null, origin: POD }, 'no-address'],
    [{ kind: 'lark', publicUrl: 'http://pod-road.example.test', origin: POD }, 'not-https'],
    [{ kind: 'lark', publicUrl: 'https://127.0.0.1', origin: POD }, 'not-https'],
    [{ kind: 'lark', publicUrl: `${POD}/?x=1`, origin: POD }, 'not-https'],
    [{ kind: 'lark', publicUrl: 'https://u:p@pod-road.example.test', origin: POD }, 'not-https'],
    [{ kind: 'lark', publicUrl: POD, origin: POD, road: 'loopback' }, 'asked'],
    [{ kind: 'Lark', publicUrl: POD, origin: POD }, 'bad-kind'],
    [{ kind: '../x', publicUrl: POD, origin: POD }, 'bad-kind'],
    [{ kind: 'gmail', publicUrl: POD, origin: POD, relayUrl: PUBLIC_RELAY, clientType: 'desktop' }, 'desktop-client'],   // lane oauth-setup-instructions
  ];
  const bad = rows.map(([i, why]) => { const v = R(i); return v.road === 'loopback' && v.redirectUri === null && v.why === why ? null : { i, v }; }).filter(Boolean);
  ok(!bad.length, `the loopback table (${rows.length} rows): a browser on this machine, no / an http / a loopback / a query-carrying address, the person's own other road, a bad kind`, bad);
  ok(CR.WHYS.every((w) => w === 'https-address' || w === 'relay-page' || rows.some(([, x]) => x === w)), 'every why in the closed set is a row of the table');
  // lane oauth-relay-road: THE RELAY ROWS
  const HUB = `http://127.0.0.1:${await freePort()}`;   // a local hub's own origin, the port it holds
  const rel = {
    fleetPod: R({ kind: 'lark', publicUrl: FLEET, origin: FLEET, relayUrl: ADMIN_RELAY, relayFleet: true }),
    publicPod: R({ kind: 'lark', publicUrl: FLEET, origin: FLEET, relayUrl: PUBLIC_RELAY }),
    barePod: R({ kind: 'lark', publicUrl: FLEET, origin: FLEET }),
    hub: R({ kind: 'gmail', publicUrl: '', origin: HUB, relayUrl: PUBLIC_RELAY }),
    lan: R({ kind: 'gmail', publicUrl: '', origin: 'http://192.168.7.20:3457', relayUrl: PUBLIC_RELAY }),
    httpsHub: R({ kind: 'gmail', publicUrl: POD, origin: POD, relayUrl: '' }),
    httpsHubPublic: R({ kind: 'gmail', publicUrl: POD, origin: POD, relayUrl: PUBLIC_RELAY }),
    asked: R({ kind: 'lark', publicUrl: FLEET, origin: FLEET, relayUrl: ADMIN_RELAY, relayFleet: true, road: 'loopback' }),
    elsewhere: R({ kind: 'lark', publicUrl: FLEET, origin: 'https://bob.fleet.example.test', relayUrl: ADMIN_RELAY, relayFleet: true }),
    noOrigin: R({ kind: 'lark', publicUrl: FLEET, origin: null, relayUrl: ADMIN_RELAY, relayFleet: true }),
  };
  ok(rel.fleetPod.road === 'relay' && rel.fleetPod.redirectUri === ADMIN_RELAY && rel.fleetPod.u === FLEET && rel.fleetPod.why === 'relay-page', 'a pod with the fleet\'s relay ⇒ the RELAY: redirect_uri = the admin host\'s /relay/, the state\'s u = the pod', rel.fleetPod);
  ok(rel.publicPod.road === 'route' && rel.barePod.road === 'route' && rel.publicPod.redirectUri === `${FLEET}/api/channels/oauth/cb/lark`, 'a pod with only the public page (it would only SHOW the code to a public https host) or with no relay ⇒ the route', { publicPod: rel.publicPod.road, barePod: rel.barePod.road });
  ok(rel.hub.road === 'relay' && rel.hub.redirectUri === PUBLIC_RELAY && rel.hub.u === HUB && rel.lan.road === 'relay' && rel.lan.u === 'http://192.168.7.20:3457', 'a local hub with the public page ⇒ the RELAY, u = its own loopback origin WITH the port it holds; a LAN origin ⇒ the relay too', { hub: rel.hub, lan: rel.lan.u });
  ok(rel.httpsHub.road === 'route' && rel.httpsHubPublic.road === 'route', 'a hub with its own https and no relay ⇒ the route (and with only the public page: the route — the page cannot send a public https host back)');
  ok(rel.asked.road === 'loopback' && rel.asked.why === 'asked' && rel.elsewhere.road === 'route' && rel.noOrigin.road === 'route', 'ORDER: the person\'s own road beats every relay; a browser on another host than this pod, or no origin told ⇒ not the relay (the route)', { asked: rel.asked.road, elsewhere: rel.elsewhere.road, noOrigin: rel.noOrigin.road });
  const badRelays = ['http://admin.fleet.example.test/relay/', 'https://admin.fleet.example.test/relay/?x=1', 'https://admin.fleet.example.test/relay/#a', 'https://u:p@admin.fleet.example.test/relay/', 'https://127.0.0.1/relay/', 'https://localhost/relay/', 'not a url', ''];
  const took = badRelays.filter((u) => R({ kind: 'gmail', publicUrl: '', origin: HUB, relayUrl: u }).road === 'relay');
  ok(!took.length && badRelays.every((u) => CR.relayPageOf(u) === '') && CR.relayPageOf(` ${PUBLIC_RELAY} `) === PUBLIC_RELAY, `a relay that is not an https page address (${badRelays.length} shapes: http, a query, a fragment, credentials, a loopback host, garbage, empty) is never ridden; a good one keeps its spelling`, took);
  // addendum 1: a company preset rides the cluster's own page — its own › the fleet's — or none, NEVER the setting (the
  // public page's home); any other client the fleet's › the setting's
  const pk = {
    presetOwn: CR.relayPick({ fleet: ADMIN_RELAY, preset: CO_RELAY, setting: PUBLIC_RELAY }),
    presetFleet: CR.relayPick({ fleet: ADMIN_RELAY, preset: '', setting: PUBLIC_RELAY }),
    presetNone: CR.relayPick({ preset: '', setting: PUBLIC_RELAY }),
    presetBad: CR.relayPick({ fleet: 'http://bad', preset: 'http://bad-too/', setting: PUBLIC_RELAY }),
    ownFleet: CR.relayPick({ fleet: ADMIN_RELAY, setting: PUBLIC_RELAY }),
    ownPage: CR.relayPick({ fleet: 'http://bad', setting: PUBLIC_RELAY }),
    ownNone: CR.relayPick({ setting: '' }),
  };
  ok(pk.presetOwn.url === CO_RELAY && pk.presetOwn.who === 'preset' && pk.presetOwn.fleet === true && pk.presetFleet.url === ADMIN_RELAY && pk.presetFleet.who === 'fleet' && pk.presetNone.url === '' && pk.presetNone.who === null && pk.presetBad.url === '',
    'relayPick, a COMPANY PRESET: its own page › the fleet\'s (the cluster\'s own — they send this instance\'s https host back); none ⇒ NO relay — the setting (the public page) is never its', pk);
  ok(pk.ownFleet.url === ADMIN_RELAY && pk.ownFleet.who === 'fleet' && pk.ownPage.url === PUBLIC_RELAY && pk.ownPage.who === 'page' && pk.ownPage.fleet === false && pk.ownNone.url === '',
    'relayPick, a person\'s own app: the fleet\'s › the setting\'s (a malformed fleet value falls through); an empty setting = none', pk);
  let settingReads = 0;
  const deps = { fleetRelayUrl: () => '', relayUrl: () => { settingReads++; return PUBLIC_RELAY; } };
  const presetRo = [CR.relayOf(deps, PRESET({ relayUrl: CO_RELAY })), CR.relayOf(deps, PRESET({})), CR.relayOf(deps, PRESET({ relayUrl: '' })), CR.relayOf({ ...deps, fleetRelayUrl: () => ADMIN_RELAY }, PRESET({})), CR.relayOf({ ...deps, fleetRelayUrl: () => ADMIN_RELAY }, PRESET({ relayUrl: CO_RELAY }))];
  const presetReads = settingReads;
  const customRo = [CR.relayOf(deps, { source: 'user', values: { relayUrl: CO_RELAY } }), CR.relayOf(deps, { source: 'custom', values: {} }), CR.relayOf(null, null)];
  ok(presetRo[0].relayUrl === CO_RELAY && presetRo[0].relayFleet === true && presetRo[1].relayUrl === '' && presetRo[2].relayUrl === '' && presetRo[3].relayUrl === ADMIN_RELAY && presetRo[4].relayUrl === CO_RELAY && presetReads === 0,
    'relayOf, a preset account: its own page; none named ⇒ the fleet\'s, else NO relay; its own outranks the fleet\'s — and the setting is never even READ for it (the public page cannot reach a preset)', { presetRo, presetReads });
  ok(customRo[0].relayUrl === PUBLIC_RELAY && customRo[0].relayFleet === false && customRo[1].relayUrl === PUBLIC_RELAY && customRo[2].relayUrl === '' && settingReads === 2,
    'relayOf, a person\'s own client: the setting\'s page (a relayUrl among its values is not its — only a preset names one); no facts = none', { customRo, settingReads });
  // rule 2: every instance on a preset WITH a page rides it — a pod (its own https host) AND a local hub; WITHOUT ⇒ the
  // route / the loopback, never the public page
  const viaPreset = (publicUrl, origin, values) => R({ kind: 'lark', publicUrl, origin, ...CR.relayOf(deps, PRESET(values)) });
  const pr = { pod: viaPreset(FLEET, FLEET, { relayUrl: CO_RELAY }), hub: viaPreset('', HUB, { relayUrl: CO_RELAY }), lan: viaPreset('', 'http://100.101.102.103:3457', { relayUrl: CO_RELAY }), barePod: viaPreset(FLEET, FLEET, {}), bareHub: viaPreset('', HUB, {}) };
  ok(pr.pod.road === 'relay' && pr.pod.redirectUri === CO_RELAY && pr.pod.u === FLEET && pr.hub.road === 'relay' && pr.hub.u === HUB && pr.lan.road === 'relay',
    'a preset WITH a relay page rides it on every instance: a pod (u = its own https host), a local hub, a hub reached over Tailscale (B-be43: 100.64/10 is private)', pr);
  ok(pr.barePod.road === 'route' && pr.bareHub.road === 'loopback' && [pr.barePod, pr.bareHub].every((x) => x.redirectUri !== PUBLIC_RELAY),
    'a preset with NO relay page (the setting at the public page) ⇒ the route on a pod, the loopback on a local hub — never the public page', { barePod: pr.barePod.road, bareHub: pr.bareHub.road });
  // the state
  const st = CR.stateOf({ origin: POD, flowId: 'a1b2c3d4e5f60718', issuedAt: 1_800_000_000_000, kind: 'lark' }, sign);
  const v = CR.stateVerdict(st, { sign, now: 1_800_000_060_000, kind: 'lark' });
  ok(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(st) && v.ok && v.parts.flowId === 'a1b2c3d4e5f60718' && v.parts.origin === POD, 'the state round-trips: v1.<clear>.<HMAC> → its flow and the address it comes back to', v);
  const otherBoot = (c) => crypto.createHmac('sha256', 'another-boot').update(String(c)).digest('base64url');
  const clear = st.split('.').slice(0, 2).join('.');
  const forged = `v1.${Buffer.from(JSON.stringify({ u: POD, f: 'ffffffffffffffff', t: 1_800_000_000, k: 'lark' })).toString('base64url')}.${st.split('.')[2]}`;
  const verdicts = {
    hmac: CR.stateVerdict(st, { sign: otherBoot, now: 1_800_000_060_000, kind: 'lark' }).why,
    kind: CR.stateVerdict(st, { sign, now: 1_800_000_060_000, kind: 'gmail' }).why,
    old: CR.stateVerdict(st, { sign, now: 1_800_000_000_000 + CR.STATE_TTL_MS + 1000, kind: 'lark' }).why,
    future: CR.stateVerdict(st, { sign, now: 1_800_000_000_000 - 120e3, kind: 'lark' }).why,
    tampered: CR.stateVerdict(forged, { sign, now: 1_800_000_060_000, kind: 'lark' }).why,
    shape: CR.stateVerdict(`${clear}.`, { sign, now: 1_800_000_060_000, kind: 'lark' }).why,
    long: CR.stateVerdict('v1.' + 'a'.repeat(1300) + '.' + 'b'.repeat(43), { sign, now: 1, kind: 'lark' }).why,
  };
  ok(verdicts.hmac === 'bad-hmac' && verdicts.kind === 'wrong-kind' && verdicts.old === 'expired' && verdicts.future === 'expired' && verdicts.tampered === 'bad-hmac' && verdicts.shape === 'bad-shape' && verdicts.long === 'bad-shape',
    'refused by name: another boot\'s HMAC, another kind, past its age, from the future, a tampered clear part, a broken shape, an oversized one', verdicts);
  // the page (lane oauth-landing-words: ONE language — English when none is said)
  const okPage = CR.landingHtml({ ok: true, user: '<b>Ada</b>' }, { name: 'Lark' });
  const deny = CR.landingHtml({ ok: false, why: 'denied' }, { name: 'Lark' });
  const used = CR.landingHtml({ ok: false, why: 'used' }, { name: 'Google' });
  ok(/data-landing="ok"/.test(okPage) && okPage.includes(`<script>${CR.CLOSE_SCRIPT}</script>`) && (okPage.match(/<p[ >]/g) || []).length === 1 && /<html lang="en">/.test(okPage) && okPage.includes('&lt;b&gt;Ada&lt;/b&gt;') && !okPage.includes('<b>Ada'),
    'a connected page: one paragraph in one language (en when none is said), the person escaped, the close script (and only it)');
  ok(/data-landing="denied"/.test(deny) && !/<script/.test(deny) && /data-landing="failed"/.test(used) && /already finished/.test(used) && /Google/.test(used) && !/<script/.test(used), 'a declined / a used sign-in says so and closes nothing');
}

// ── lane oauth-landing-words (the owner 2026-10-23 14:3x PT 「这个提示里为啥把 email 打码了」 + B-24d8) ──
console.log('⑪ the landing speaks ONE language, shows the address as typed, and names its verdict (PURE)');
{
  // (a) THE LANGUAGE PICK — the browser's first language (the highest q), by the app's own rule (src/lib/i18n.js)
  //     [Accept-Language as a browser sends it, that browser's navigator.language, the page's language]
  const PICK = [
    [undefined, undefined, 'en'], ['', undefined, 'en'], [42, undefined, 'en'], [['zh-CN'], undefined, 'en'],
    ['zh-CN,zh;q=0.9,en;q=0.8', 'zh-CN', 'zh'], ['zh-TW,zh;q=0.9', 'zh-TW', 'zh'], ['ZH-hk', 'ZH-hk', 'zh'], ['zh', 'zh', 'zh'], ['zh-Hant-TW', 'zh-Hant-TW', 'zh'],
    ['ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7', 'ja-JP', 'ja'], ['ja', 'ja', 'ja'],
    ['en-US,en;q=0.9,zh-CN;q=0.8', 'en-US', 'en'], ['en-GB', 'en-GB', 'en'],
    ['fr-FR,fr;q=0.9,zh-CN;q=0.8', 'fr-FR', 'en'], ['de-DE', 'de-DE', 'en'], ['ko-KR,ko;q=0.9,ja;q=0.8', 'ko-KR', 'en'],
    ['de;q=0.5, ja;q=0.9', 'ja', 'ja'], ['en;q=0.8,zh-CN', 'zh-CN', 'zh'], ['zh;q=0, ja;q=0.4', 'ja', 'ja'],
    ['*', undefined, 'en'], ['*;q=1, zh;q=0.5', 'zh', 'zh'], ['zh;q=0', undefined, 'en'], ['zh;q=abc,ja', 'ja', 'ja'], ['zh_CN', undefined, 'en'], ['<script>', undefined, 'en'],
    ['x'.repeat(600) + ',zh', undefined, 'en'], [',,;;,', undefined, 'en'],
  ];
  const pickBad = PICK.filter(([h, , want]) => CR.landingLang(h) !== want);
  ok(!pickBad.length, `the language pick table (${PICK.length} rows): zh* → zh, ja* → ja, anything else → en; the highest q wins, q=0 never counts, a header past ${512} characters is read no further`, pickBad);
  // (a') PARITY with the app: src/lib/i18n.js resolveLang() over navigator.language (the browser's first language), run as shipped
  const had = { nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), ls: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
  const navStub = { language: 'en' };
  Object.defineProperty(globalThis, 'navigator', { value: navStub, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {} }, configurable: true, writable: true });
  let parity = [];
  // the shipped file as an .mjs copy with its two 1 MB dictionaries stubbed (resolveLang never reads them) — every other byte as shipped
  const i18nSrc = fs.readFileSync(path.join(REPO, 'src/lib/i18n.js'), 'utf8');
  const DICT_IMPORTS = ["import zh from './i18n-zh.js';", "import ja from './i18n-ja.js';"];
  ok(DICT_IMPORTS.every((x) => i18nSrc.split(x).length === 2) && /export function resolveLang\(\)/.test(i18nSrc), 'src/lib/i18n.js still imports its two dictionaries and exports resolveLang (the parity copy\'s two stubs land)');
  try {
    const I18N = await import(new URL(`file://${MUT.write('src/lib/i18n.js', DICT_IMPORTS.reduce((t, x) => t.replace(x, `const ${x.split(' ')[1]} = {};`), i18nSrc), 'parity', { esm: true })}`).href);
    parity = PICK.filter(([h]) => typeof h === 'string').map(([h, nav]) => { navStub.language = nav || 'en'; return { h, nav, app: I18N.resolveLang(), page: CR.landingLang(h) }; });
  } finally {
    for (const [k, d] of [['navigator', had.nav], ['localStorage', had.ls]]) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  }
  const parityBad = parity.filter((x) => x.app !== x.page);
  ok(parity.length >= 20 && !parityBad.length, `the page's language = the app's own: src/lib/i18n.js resolveLang() over the same browser's navigator.language, row for row (${parity.length} rows)`, parityBad);
  ok(CR.LANGS.join() === 'en,zh,ja' && Object.values(CR.LANDING).every((row) => CR.LANGS.every((l) => typeof row[l] === 'string' && row[l])) && Object.values(CR.LANDING_WHY).every((row) => CR.LANGS.every((l) => typeof row[l] === 'string' && row[l])),
    'every page and every verdict has its sentence in each of the three languages');
  // (b) ONE language per page: its sentence, and NEITHER of the other two languages' sentences
  const OTHER = (l) => CR.LANGS.filter((x) => x !== l);
  const fillName = (t, nm) => t.split('{name}').join(nm).replace('{user}', '').replace('{why}', '');
  const one = [];
  for (const [kind, r] of [['ok', { ok: true, user: 'Ada Road' }], ['denied', { ok: false, why: 'denied' }], ['too-many', { ok: false, why: 'too-many' }], ['failed', { ok: false, why: 'expired' }]]) {
    for (const l of CR.LANGS) {
      const page = CR.landingHtml(r, { name: 'Lark', lang: l });
      const head = (t) => fillName(t, 'Lark').split(/[{(（]/)[0].trim().slice(0, 18);
      const mine = page.includes(head(CR.LANDING[kind][l])) && new RegExp(`<html lang="${l}">`).test(page) && (page.match(/<p[ >]/g) || []).length === 1;
      const others = OTHER(l).filter((o) => page.includes(head(CR.LANDING[kind][o])) || page.includes(CR.LANDING_WHY.expired[o]));
      if (!mine || others.length) one.push({ kind, l, mine, others });
    }
  }
  ok(!one.length, 'every page × every language: ONE paragraph, its own sentence and <html lang>, never the other two languages (the base printed en + zh + ja stacked)', one);
  ok(CR.landingHtml({ ok: true }, { name: 'Lark', lang: 'fr' }).includes('<html lang="en">') && CR.landingHtml({ ok: true }, { name: 'Lark', lang: '<x>' }).includes('<html lang="en">'), 'a language outside the three is English (never written into the page)');
  ok(CR.landingHtml({ ok: true }, { name: 'Lark', lang: 'zh' }).includes(`<script>${CR.CLOSE_SCRIPT}</script>`) && /自己关闭/.test(CR.landingHtml({ ok: true }, { name: 'Lark', lang: 'zh' })) && /自動で閉じます/.test(CR.landingHtml({ ok: true }, { name: 'Lark', lang: 'ja' })),
    'a connected page in zh / ja still closes its tab by itself and says so in that language');
  // (c) THE ADDRESS — what Cloudflare's Email Address Obfuscation rewrites (an address in the HTML) never appears bare
  const CF = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const ADDR = 'ada.road+x@example.test';
  ok(CF.test(`signed in to Google (${ADDR})`), 'CONTROL: the obfuscation pattern catches the address as the base page printed it (escaped text, a bare @)');
  ok(CR.landingUser(ADDR) === '<!--email_off-->ada.road+x&#64;example.test<!--/email_off-->' && CR.landingUser('') === '' && CR.landingUser(null) === '' && CR.landingUser('<b>a@b.c</b>') === '<!--email_off-->&lt;b&gt;a&#64;b.c&lt;/b&gt;<!--/email_off-->',
    'landingUser: the address escaped as text, its @ as &#64;, inside Cloudflare\'s <!--email_off--> … <!--/email_off--> markers; nothing for no address');
  const addrBad = CR.LANGS.map((l) => ({ l, page: CR.landingHtml({ ok: true, user: ADDR }, { name: 'Google', lang: l }) })).filter(({ page }) => CF.test(page) || page.includes('@') || !page.includes('<!--email_off-->ada.road+x&#64;example.test<!--/email_off-->'));
  ok(!addrBad.length, 'a connected Google page in each language: the address between both markers with the @ as an entity — no bare @ anywhere, nothing the obfuscation pattern matches', addrBad.map((x) => x.l));
  ok(CR.landingHtml({ ok: true, user: "a$'b$&<i>" }, { name: 'Lark' }).includes("(<!--email_off-->a$&#39;b$&amp;&lt;i&gt;<!--/email_off-->)"), 'a person whose name holds $\' / $& / markup prints it as typed (escaped; no replacement pattern is expanded)');
  // (d) THE VERDICTS — each says what happened in the one language; no sentence stands in for another's
  const WHYS_SEEN = ['bad-hmac', 'expired', 'timed-out', 'bad-shape', 'wrong-kind', 'wrong-flow', 'superseded', 'cancelled', 'over-limit', 'used', 'failed'];
  ok(WHYS_SEEN.every((w) => Object.prototype.hasOwnProperty.call(CR.LANDING_WHY, w)) && Object.keys(CR.LANDING_WHY).every((w) => w === 'refused' || WHYS_SEEN.includes(w)), 'LANDING_WHY covers every refusal the state, the engine and the flow name (+ refused for anything else)', Object.keys(CR.LANDING_WHY));
  const sentence = (w, l) => CR.LANDING_WHY[w][l].split('{name}').join('Lark');
  const matrix = [];
  for (const l of CR.LANGS) for (const w of [...WHYS_SEEN, 'nonsense', undefined]) {
    const page = CR.landingHtml({ ok: false, why: w }, { name: 'Lark', lang: l });
    const own = Object.prototype.hasOwnProperty.call(CR.LANDING_WHY, w) ? w : 'refused';
    const wrong = Object.keys(CR.LANDING_WHY).filter((x) => x !== own && page.includes(CR.LANDING_WHY[x][l].split('{name}').join('Lark').replace(/&/g, '&amp;')));
    if (!page.includes(sentence(own, l)) || wrong.length || !/data-landing="failed"/.test(page)) matrix.push({ l, w, own, wrong });
  }
  ok(!matrix.length, `per verdict × language (${3 * (WHYS_SEEN.length + 2)} pages): its own sentence and NONE of the others' — the «expired» words only for an expired state; an unknown why reads «refused», which claims nothing`, matrix);
  ok(/before VibeSpace restarted/.test(sentence('bad-hmac', 'en')) && /重启之前/.test(sentence('bad-hmac', 'zh')) && /再起動する前/.test(sentence('bad-hmac', 'ja')) && /longer than 30 minutes/.test(sentence('expired', 'en')) && /30 分钟/.test(sentence('expired', 'zh')) && /30 分以上/.test(sentence('expired', 'ja')) && CR.STATE_TTL_MS === 30 * 60e3,
    'a state signed before a restart (bad-hmac) says VibeSpace restarted; an expired one says it took longer than the state\'s 30 minutes (the number IS STATE_TTL_MS)');
  // the REAL verdicts, end to end through the page: another boot's HMAC after a restart, an old state, a broken one, another kind
  const rst = CR.stateOf({ origin: POD, flowId: 'abcdef0123456789', issuedAt: 1_800_000_000_000, kind: 'lark' }, sign);
  const otherBoot = (c) => crypto.createHmac('sha256', 'the-boot-before').update(String(c)).digest('base64url');
  const real = {
    'bad-hmac': CR.stateVerdict(rst, { sign: otherBoot, now: 1_800_000_060_000, kind: 'lark' }).why,
    expired: CR.stateVerdict(rst, { sign, now: 1_800_000_000_000 + CR.STATE_TTL_MS + 1000, kind: 'lark' }).why,
    'bad-shape': CR.stateVerdict(rst.slice(0, 20), { sign, now: 1_800_000_060_000, kind: 'lark' }).why,
    'wrong-kind': CR.stateVerdict(rst, { sign, now: 1_800_000_060_000, kind: 'gmail' }).why,
  };
  const realBad = Object.entries(real).filter(([want, got]) => got !== want || !CR.landingHtml({ ok: false, why: got }, { name: 'Lark', lang: 'zh' }).includes(sentence(want, 'zh')));
  ok(!realBad.length, 'the state\'s own verdicts reach the page as their own words (zh): a restart, past 30 minutes, a cut address, another kind', real);
  // (e) RED CONTROLS (mutant copies of src/consent-road.js)
  const roadSrc = fs.readFileSync(path.join(REPO, 'src/consent-road.js'), 'utf8');
  const USER = "  const user = x.ok && typeof x.user === 'string' && x.user ? ` (${landingUser(x.user)})` : '';";
  const bare = MUT.load('src/consent-road.js', roadSrc.replace(USER, "  const user = x.ok && typeof x.user === 'string' && x.user ? ` (${escHtml(x.user.slice(0, 200))})` : '';"), 'bare-user');
  const bp = bare.landingHtml({ ok: true, user: ADDR }, { name: 'Google' });
  ok(roadSrc.split(USER).length === 2 && CF.test(bp) && !bp.includes('email_off'), 'RED CONTROL: the address printed as escaped text alone (the base) is what Cloudflare rewrites into «[email protected]» — red on (c)', bp.match(CF) && bp.match(CF)[0]);
  const WHY = "  const why = (Object.prototype.hasOwnProperty.call(LANDING_WHY, x.why) ? LANDING_WHY[x.why] : LANDING_WHY.refused)[l];";
  const catchAll = MUT.load('src/consent-road.js', roadSrc.replace(WHY, '  const why = LANDING_WHY.expired[l];'), 'catch-all');
  const caught = WHYS_SEEN.filter((w) => w !== 'expired' && catchAll.landingHtml({ ok: false, why: w }, { name: 'Lark', lang: 'en' }).includes(sentence('expired', 'en')));
  ok(roadSrc.split(WHY).length === 2 && caught.length === WHYS_SEEN.length - 1, `RED CONTROL: a page whose every refusal reads «expired» (the owner's B-24d8) — red on (d) for each of the ${WHYS_SEEN.length - 1} other verdicts`, caught);
  const LANG_PICK = "  const l = LANGS.includes(lang) ? lang : 'en';";
  const stacked = MUT.load('src/consent-road.js', roadSrc.replace(LANG_PICK, "  const l = 'en';"), 'deaf');
  ok(roadSrc.split(LANG_PICK).length === 2 && !stacked.landingHtml({ ok: true }, { name: 'Lark', lang: 'zh' }).includes(CR.LANDING.ok.zh.split('{')[0].slice(0, 12)), 'RED CONTROL: a page deaf to the language answers a zh browser in English — red on (b)');
}

// ── the loopback fake vendor (Lark both brands, Google) ──
const seen = [];
const vendor = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    let parsed = null;
    try { parsed = /json/.test(String(req.headers['content-type'] || '')) ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body)); } catch { parsed = body; }
    seen.push({ method: req.method, path: u.pathname, body: parsed });
    const j = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (/\/open-apis\/authen\/v2\/oauth\/token$/.test(u.pathname)) return j(200, { code: 0, access_token: 'u-road-access', expires_in: 7200, refresh_token: 'ur-road-refresh', refresh_token_expires_in: 604800, scope: 'im:message im:message.send_as_user im:chat:readonly' });
    if (/\/open-apis\/authen\/v1\/user_info$/.test(u.pathname)) return j(200, { code: 0, data: { open_id: 'ou_road_ada', name: 'Ada Road', union_id: 'on_road', user_id: 'road01', tenant_key: 'tk_road' } });
    if (u.pathname === '/google-oauth/token') return j(200, { access_token: 'ya29.road', expires_in: 3600, refresh_token: '1//road-refresh', scope: 'https://www.googleapis.com/auth/gmail.modify' });
    if (/\/gmail\/v1\/users\/me\/profile$/.test(u.pathname)) return j(200, { emailAddress: 'ada.road@example.test', historyId: '1' });
    return j(404, { code: 99991663, msg: 'not in the fake' });
  });
});
await new Promise((r) => vendor.listen(0, '127.0.0.1', r));
const VBASE = `http://127.0.0.1:${vendor.address().port}`;
const HOSTS = { 'open.feishu.cn': '/feishu', 'accounts.feishu.cn': '/feishu-accounts', 'open.larksuite.com': '/larksuite', 'accounts.larksuite.com': '/larksuite-accounts', 'oauth2.googleapis.com': '/google-oauth', 'gmail.googleapis.com': '/gmail-api' };
const fetchFn = (url, opts) => {
  const u = new URL(String(url));
  const pre = HOSTS[u.hostname];
  if (!pre) return Promise.reject(new Error(`the suite's fake has no ${u.hostname}`));
  return fetch(`${VBASE}${pre}${u.pathname}${u.search}`, opts);
};
const hostOf = (p) => Object.entries(HOSTS).find(([, pre]) => p.startsWith(pre + '/'))?.[0] || null;

// ── the world: the real store, engine and routes ──
// lane oauth-relay-one-source: `env` is the process env handed to the STORE (the fleet relay's one reader — the engine reads
// no env for it) and to the engine; `presets` = a presets-directory reader (src/server/cluster-presets.js) or null; `eng` =
// the engine module (a RED control hands a mutant copy)
async function world(tag, { fixedPath = 'lark/cb', publicUrl = POD, larkPreset = { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark' }, env = {}, presets = null, eng = ENG, serverSetting = () => undefined, drive = { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1' } } = {}) {
  const dir = path.join(ROOT, tag);
  fs.mkdirSync(dir, { recursive: true });
  const integrations = STORE.create({ dataDir: path.join(dir, 'store'), env: { ...env, VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'lark', key: 'co', label: 'Company app', values: larkPreset }]) }, presets, now: () => Date.now(), broadcast: () => {}, drivePresets: () => [drive], log: quiet });
  const fixed = `http://127.0.0.1:${await freePort()}/${fixedPath}`;
  const oauth = OL.createOAuthLoopback({ log: quiet, fixedCallbackUrl: fixed });
  const e = eng.create({ dataDir: path.join(dir, 'eng'), env, serverSetting, broadcast: () => {}, integrations, log: quiet, fetch: fetchFn, oauth, publicUrl: () => publicUrl });
  RT.setup({ getEngine: () => e });
  const app = express(); app.use(express.json()); app.use(RT.router);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const get = (p) => new Promise((resolve) => {
    const rq = http.request(`http://127.0.0.1:${srv.address().port}${p}`, { method: 'GET' }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, csp: String(res.headers['content-security-policy'] || ''), body: b })); });
    rq.on('error', (er) => resolve({ status: 0, csp: '', body: String(er.message) }));
    rq.end();
  });
  const close = async () => { try { oauth.stopAll(); } catch {} try { await e.stop(); } catch {} await new Promise((r) => srv.close(r)); };
  return { e, get, close, fixed, oauth, origin: `http://127.0.0.1:${srv.address().port}` };
}
/** lane oauth-relay-road: an instance whose relay settings are BLANK (Settings → Channels: no relay page) */
const NO_RELAY = (k) => (/^channels\.(lark|gmail)RelayUrl$/.test(k) ? '' : undefined);
const landOn = (consentUrl, code) => { const u = new URL(consentUrl); const back = new URL(u.searchParams.get('redirect_uri')); return `${back.pathname}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(u.searchParams.get('state'))}`; };
const waitDone = async (e, flowId) => { for (let i = 0; i < 100 && !(e.oauthStatus(flowId) || {}).done; i++) await sleep(20); return e.oauthStatus(flowId); };
const HASH = crypto.createHash('sha256').update(CR.CLOSE_SCRIPT).digest('base64');

// ── ② the route ──
console.log('② a pod\'s Connect comes back to the instance\'s route (Lark, Gmail)');
{
  const w = await world('route');
  try {
    ok(w.e.connectTaught() === true, '⑤ nothing connected and the admin offers a company app ⇒ the hook teaches `connect` (the reach word)');
    const st = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: POD });
    const cu = new URL(st.url);
    ok(cu.hostname === 'accounts.larksuite.com' && cu.searchParams.get('redirect_uri') === ROUTE_LARK && cu.searchParams.get('client_id') === 'cli_road0001' && /^v1\./.test(cu.searchParams.get('state') || ''),
      'Connect Lark from a pod: the consent is Lark INTERNATIONAL (the preset\'s brand) and redirect_uri = the instance\'s route', { host: cu.hostname, redirect: cu.searchParams.get('redirect_uri') });
    ok(st.flow.mode === 'public' && st.flow.listening === false && st.flow.port === null && st.flow.redirectUri === ROUTE_LARK, 'nothing listens on the pod\'s loopback (mode public, no port)', st.flow);
    seen.length = 0;
    const land = await w.get(landOn(st.url, 'road-lark-code'));
    ok(land.status === 200 && /data-landing="ok"/.test(land.body) && /Ada Road/.test(land.body) && land.body.includes(`<script>${CR.CLOSE_SCRIPT}</script>`), 'the browser lands on the route: the page says connected (who) and closes its tab', land.body.slice(0, 300));
    ok(land.csp.includes(`script-src 'sha256-${HASH}'`) && /default-src 'none'/.test(land.csp), 'the route\'s CSP allows exactly the close script, by its hash (nothing else runs)', land.csp);
    const tok = seen.find((x) => /authen\/v2\/oauth\/token$/.test(x.path));
    ok(tok && hostOf(tok.path) === 'open.larksuite.com' && tok.body.redirect_uri === ROUTE_LARK && tok.body.code === 'road-lark-code' && tok.body.client_id === 'cli_road0001' && seen.some((x) => /user_info$/.test(x.path)),
      'the fake vendor saw the SAME exchange with the route as its redirect (Lark international), then one user_info', seen.map((x) => `${x.method} ${x.path}`));
    const s1 = await waitDone(w.e, st.flowId);
    ok(s1 && s1.done && s1.ok && s1.token === st.flowId && s1.user === 'Ada Road', 'the flow is done — the dialog\'s poll reads the token', s1);
    const made = await w.e.connect('lark', { flowId: st.flowId });
    ok(made && made.adapter && made.adapter.kind === 'lark' && made.adapter.options && made.adapter.options.brand === 'lark', 'Connect makes the account under the preset, brand lark', made && made.adapter && { kind: made.adapter.kind, options: made.adapter.options });
    const again = await w.get(landOn(st.url, 'road-lark-code'));
    ok(again.status === 400 && /data-landing="failed"/.test(again.body) && !/<script/.test(again.body), 'a replayed landing is refused on the page (the code is used once)', again.status);
    ok(w.e.connectTaught() === false && w.e.connectOffer('lark').signedIn === 1, '⑤ an account exists ⇒ `connect` is no longer taught; the offer counts the signed-in account');
    // Gmail
    const g = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
    const gu = new URL(g.url);
    ok(gu.hostname === 'accounts.google.com' && gu.searchParams.get('redirect_uri') === ROUTE_GMAIL && g.flow.mode === 'public' && g.flow.port === null, 'Connect Gmail from a pod: redirect_uri = the instance\'s route, nothing listens', { host: gu.hostname, redirect: gu.searchParams.get('redirect_uri'), mode: g.flow.mode });
    seen.length = 0;
    const gl = await w.get(landOn(g.url, 'road-google-code'));
    const gt = seen.find((x) => x.path === '/google-oauth/token');
    ok(gl.status === 200 && /data-landing="ok"/.test(gl.body) && /Google/.test(gl.body) && gt && gt.body.redirect_uri === ROUTE_GMAIL && gt.body.code === 'road-google-code' && seen.some((x) => /profile$/.test(x.path)),
      'the Google landing: connected; the token exchange carried the route as its redirect, then one profile read', { status: gl.status, token: gt && gt.body.redirect_uri });
    const gs = await waitDone(w.e, g.flowId);
    ok(gs && gs.ok && gs.user === 'ada.road@example.test', 'the Gmail flow is done as the mailbox the profile named', gs);
    // ④ the kinds digest
    const kinds = (w.e.digest({ scope: 'accounts' }).kinds || []);
    const kl = kinds.find((k) => k.kind === 'lark'), kg = kinds.find((k) => k.kind === 'gmail'), ks = kinds.find((k) => k.kind === 'slack');
    ok(kl && kl.consentRoute === ROUTE_LARK && kg && kg.consentRoute === ROUTE_GMAIL && (!ks || ks.consentRoute === null) && (kl.presets[0] || {}).facts && kl.presets[0].facts.brand === 'lark',
      '④ the kinds digest: the route a custom app registers (Lark, Gmail; none for the paste type) + the preset\'s brand as a fact', { lark: kl && kl.consentRoute, presets: kl && kl.presets });
    // ⑤ the Connect row's facts
    const o = w.e.connectOffer('gmail'), none = w.e.connectOffer('nope'), offers = w.e.connectOffers().map((x) => x.kind);
    ok(o.ok && o.kind === 'gmail' && o.label === 'Gmail' && o.preset === true && none.ok === false && none.code === 'bad-request' && /lark/.test(none.error) && !offers.includes('lark'),
      '⑤ connectOffer names a type (label, company app offered); an unknown type answers the types; connectOffers leaves out a type with a signed-in account', { o, none: none.error, offers });
  } finally { await w.close(); }
}

// ── ③ the loopback stays the road of a local hub ──
console.log('③ the loopback stays the road of a local hub with no relay page (and the person\'s own other road)');
{
  const w = await world('loop', { serverSetting: NO_RELAY });
  try {
    const local = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: 'http://127.0.0.1' });
    ok(local.flow.mode === 'fixed' && new URL(local.url).searchParams.get('redirect_uri') === w.fixed && local.flow.listening === true, 'a browser on this machine, the relay setting blank ⇒ Lark\'s registered FIXED loopback, listening (the local hub\'s road, as before)', local.flow);
    const other = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: POD, road: 'loopback' });
    ok(other.flow.mode === 'fixed' && new URL(other.url).searchParams.get('redirect_uri') === w.fixed, 'the person\'s other road (`road: loopback`) from a pod ⇒ the fixed loopback (the paste-back finishes it)', other.flow.mode);
    const brand = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: POD, options: { brand: 'feishu' } });
    ok(new URL(brand.url).hostname === 'accounts.feishu.cn', '④ a brand the dialog sent wins over the preset\'s (Feishu here)', new URL(brand.url).hostname);
  } finally { await w.close(); }
  const n = await world('noaddr', { publicUrl: null, serverSetting: NO_RELAY });
  try {
    const g = await n.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
    ok(g.flow.mode === 'ephemeral' && /^http:\/\/127\.0\.0\.1:\d+$/.test(new URL(g.url).searchParams.get('redirect_uri')), 'no address ⇒ Gmail\'s EPHEMERAL loopback port, as before', new URL(g.url).searchParams.get('redirect_uri'));
    ok(((n.e.digest({ scope: 'accounts' }).kinds || []).find((k) => k.kind === 'lark') || {}).consentRoute === null, '④ no address ⇒ no route in the digest');
  } finally { await n.close(); }
  const h = await world('http', { publicUrl: 'http://pod-road.example.test' });
  try {
    const l = await h.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: 'http://pod-road.example.test' });
    ok(l.flow.mode === 'fixed', 'an http address (a vendor sends a person to https only) ⇒ the loopback', l.flow.mode);
  } finally { await h.close(); }
}

// ── ⑦ the relay road (lane oauth-relay-road) ──
console.log('⑦ the relay road: one registered address per app — the real engine through the real relay page');
const FLEET_ENV = { VIBESPACE_OAUTH_RELAY_URL: ADMIN_RELAY };
let fleetRedirect = null;
{
  const f = await world('fleet', { publicUrl: FLEET, env: FLEET_ENV });
  try {
    const st = await f.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET });
    const cu = new URL(st.url);
    fleetRedirect = cu.searchParams.get('redirect_uri');
    const clear = relayPage.stateOrigin(cu.searchParams.get('state'));
    ok(fleetRedirect === ADMIN_RELAY && st.flow.mode === 'public' && st.flow.road === 'relay' && st.flow.port === null && clear === FLEET && relayPage.stateKind(cu.searchParams.get('state')) === 'lark',
      'a fleet pod (VIBESPACE_OAUTH_RELAY_URL): Connect Lark names the ADMIN host\'s /relay/ as redirect_uri — the same address for every pod; the state\'s u = this pod, k = lark; nothing listens', { redirect: fleetRedirect, road: st.flow.road, u: clear });
    const d = throughRelay(st.url, 'code=relay-lark-code', ['fleet.example.test']);
    const to = d.act === 'redirect' ? new URL(d.to) : null;
    ok(to && to.origin === FLEET && to.pathname === '/api/channels/oauth/cb/lark' && to.searchParams.get('code') === 'relay-lark-code', 'the admin copy of the page (data-allow = the fleet\'s domain) sends the browser to <pod>/api/channels/oauth/cb/lark with the query', d);
    seen.length = 0;
    const land = await f.get(`${to.pathname}${to.search}`);
    const tok = seen.find((x) => /authen\/v2\/oauth\/token$/.test(x.path));
    ok(land.status === 200 && /data-landing="ok"/.test(land.body) && tok && tok.body.redirect_uri === ADMIN_RELAY && tok.body.code === 'relay-lark-code', 'the pod\'s landing says connected; the fake vendor saw the exchange with the RELAY page as its redirect (the one the consent named)', { status: land.status, redirect: tok && tok.body.redirect_uri });
    const done = await waitDone(f.e, st.flowId);
    const made = done && done.ok ? await f.e.connect('lark', { flowId: st.flowId }) : null;
    ok(made && made.adapter && made.adapter.kind === 'lark', 'the flow is done and Connect makes the account — no per-pod address was registered anywhere', done);
    const kinds = f.e.digest({ scope: 'accounts' }).kinds || [];
    const pages = (k) => JSON.stringify((kinds.find((x) => x.kind === k) || {}).relayPages);
    ok(pages('lark') === JSON.stringify([{ url: ADMIN_RELAY, who: 'fleet' }, { url: PUBLIC_RELAY, who: 'page' }]) && pages('gmail') === pages('lark') && pages('slack') === '[]',
      'the kinds digest names the TWO addresses a person\'s own app registers once (the fleet\'s, the public page) for Lark and Gmail; Slack keeps its own steps', { lark: pages('lark'), slack: pages('slack') });
    const presetPages = ['lark', 'gmail'].map((k) => ((kinds.find((x) => x.kind === k) || {}).presets || []).map((x) => [x.key, x.relayPage]));
    ok(JSON.stringify(presetPages) === JSON.stringify([[['co', ADMIN_RELAY]], [['org1', ADMIN_RELAY]]]), 'addendum 1: each COMPANY preset\'s own relay page in the digest = the fleet\'s here (the preset names none) — the public page is a person\'s own app\'s alone', presetPages);
    const pg = await f.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: FLEET });
    ok(new URL(pg.url).searchParams.get('redirect_uri') === ADMIN_RELAY && pg.flow.road === 'relay', 'Gmail on the same pod rides the same fleet relay (one value for every kind)', new URL(pg.url).searchParams.get('redirect_uri'));
  } finally { await f.close(); }
}
{
  const h = await world('hub', { publicUrl: null });
  try {
    // addendum 1: the company presets name no relay page here — the loopback, as before; never the public page
    const lp = await h.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: h.origin });
    const gp = await h.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: h.origin });
    const lpr = new URL(lp.url).searchParams.get('redirect_uri'), gpr = new URL(gp.url).searchParams.get('redirect_uri');
    ok(lp.flow.mode === 'fixed' && lpr === h.fixed && gp.flow.mode === 'ephemeral' && /^http:\/\/127\.0\.0\.1:\d+$/.test(gpr) && lp.flow.road !== 'relay' && gp.flow.road !== 'relay',
      'a local hub whose COMPANY presets name no relay page (the setting at its default, the public page): Lark\'s registered loopback, Gmail\'s ephemeral port — NEVER the public page', { lark: lpr, gmail: gpr });
    const st = await h.e.startOAuth({ kind: 'gmail', clientPreset: 'custom', clientId: '456-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-2', origin: h.origin });
    const cu = new URL(st.url);
    ok(cu.searchParams.get('redirect_uri') === PUBLIC_RELAY && st.flow.road === 'relay' && relayPage.stateOrigin(cu.searchParams.get('state')) === h.origin,
      'a person\'s OWN Google client on that hub: Connect Gmail names the PUBLIC page (the setting\'s default); the state\'s u = the hub\'s own loopback origin with the port it holds', { redirect: cu.searchParams.get('redirect_uri'), u: relayPage.stateOrigin(cu.searchParams.get('state')) });
    const q = 'code=4%2F0Ab-relay-google&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.modify+openid&authuser=0&prompt=consent';
    const d = throughRelay(st.url, q, []);
    const at = d.act === 'redirect' ? d.to : '';
    ok(at.startsWith(`${h.origin}/api/channels/oauth/cb/gmail?${q}&state=`), 'the public page sends the browser to <hub>/api/channels/oauth/cb/gmail with Google\'s query VERBATIM (code, scope, authuser, prompt, state)', at.slice(0, 200));
    seen.length = 0;
    const land = await h.get(at.slice(h.origin.length));
    const gt = seen.find((x) => x.path === '/google-oauth/token');
    ok(land.status === 200 && /data-landing="ok"/.test(land.body) && gt && gt.body.redirect_uri === PUBLIC_RELAY && gt.body.code === '4/0Ab-relay-google', 'the hub\'s landing: connected; the Google exchange carried the public page as its redirect and the code decoded once', { status: land.status, redirect: gt && gt.body.redirect_uri, code: gt && gt.body.code });
    const ls = await h.e.startOAuth({ kind: 'lark', clientPreset: 'custom', clientId: 'cli_road0002', clientSecret: 'dummy-road-secret-02', origin: h.origin });
    const ld = throughRelay(ls.url, 'code=relay-hub-lark', []);
    seen.length = 0;
    const ll = ld.act === 'redirect' ? await h.get(ld.to.slice(h.origin.length)) : { status: 0, body: '' };
    ok(new URL(ls.url).searchParams.get('redirect_uri') === PUBLIC_RELAY && ll.status === 200 && /data-landing="ok"/.test(ll.body) && (seen.find((x) => /oauth\/token$/.test(x.path)) || { body: {} }).body.redirect_uri === PUBLIC_RELAY, 'a person\'s own Lark app on the local hub: the same public page, code + state ride on, connected', { act: ld.act, status: ll.status });
    const kinds = h.e.digest({ scope: 'accounts' }).kinds || [];
    const pages = (kinds.find((x) => x.kind === 'lark') || {}).relayPages;
    const presetPages = ['lark', 'gmail'].map((k) => ((kinds.find((x) => x.kind === k) || {}).presets || []).map((x) => [x.key, x.relayPage]));
    ok(JSON.stringify(pages) === JSON.stringify([{ url: PUBLIC_RELAY, who: 'page' }]) && JSON.stringify(presetPages) === JSON.stringify([[['co', null]], [['org1', null]]]),
      'the local hub\'s digest: a person\'s own app lists the public page alone (no fleet here); each COMPANY preset says it has NO relay page (relayPage null — the dialog says «no relay page yet»)', { pages, presetPages });
  } finally { await h.close(); }
}
{
  const CO = 'https://relay.company.example.test/vs/';
  const p = await world('preset-relay', { publicUrl: null, larkPreset: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', relayUrl: CO }, drive: { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1', relayUrl: CO } });
  try {
    const l = await p.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: p.origin });
    const g = await p.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: p.origin });
    const c = await p.e.startOAuth({ kind: 'lark', clientPreset: 'custom', clientId: 'cli_road0002', clientSecret: 'dummy-road-secret-02', origin: p.origin });
    ok(new URL(l.url).searchParams.get('redirect_uri') === CO && new URL(g.url).searchParams.get('redirect_uri') === CO && new URL(c.url).searchParams.get('redirect_uri') === PUBLIC_RELAY,
      'a company preset that names its own relay page (a Lark JSON entry, a Google drive preset) rides it; a custom client on the same hub rides the setting\'s page', { lark: new URL(l.url).searchParams.get('redirect_uri'), gmail: new URL(g.url).searchParams.get('redirect_uri'), custom: new URL(c.url).searchParams.get('redirect_uri') });
    const kinds = p.e.digest({ scope: 'accounts' }).kinds || [];
    const rp = ['lark', 'gmail'].map((k) => (((kinds.find((x) => x.kind === k) || {}).presets || [])[0] || {}).relayPage);
    ok(rp[0] === CO && rp[1] === CO, 'the digest names each preset\'s own relay page (what the dialog\'s preset setup shows)', rp);
  } finally { await p.close(); }
  // addendum 1, rule 2: every instance on the preset rides its page — a POD too (its own https host: the cluster's page
  // sends it back), and the preset's own page outranks the fleet's
  for (const [tag, env] of [['preset-relay-pod', {}], ['preset-relay-fleet', FLEET_ENV]]) {
    const q = await world(tag, { publicUrl: FLEET, env, larkPreset: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', relayUrl: CO }, drive: { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1', relayUrl: CO } });
    try {
      const l = await q.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET });
      const g = await q.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: FLEET });
      const d = throughRelay(l.url, 'code=preset-pod-code', ['fleet.example.test']);
      ok(new URL(l.url).searchParams.get('redirect_uri') === CO && new URL(g.url).searchParams.get('redirect_uri') === CO && l.flow.road === 'relay' && d.act === 'redirect' && d.to.startsWith(`${FLEET}/api/channels/oauth/cb/lark?code=preset-pod-code&state=`),
        `a POD on the preset (${env.VIBESPACE_OAUTH_RELAY_URL ? 'the fleet\'s page set too: the preset\'s own outranks it' : 'no fleet page'}) rides the preset's relay page; the cluster's copy sends the pod back`, { lark: new URL(l.url).searchParams.get('redirect_uri'), act: d.act });
    } finally { await q.close(); }
  }
}

// ── ⑥ RED CONTROLS ──
console.log('⑥ RED controls (mutant copies)');
{
  const CRED = { source: 'user', values: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01' }, missing: [], why: null };
  const GCRED = { source: 'user', values: { clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1' }, missing: [], why: null };
  const tokens = () => ({ read: () => ({ token: null, why: 'never-authenticated' }), write: async () => {}, clear: async () => {} });
  const redirectOf = async (mod, kind, cred, consent, origin) => {
    const reg = CH.createChannelRegistry(); reg.register(mod);
    const oauth = OL.createOAuthLoopback({ log: quiet, fixedCallbackUrl: `http://127.0.0.1:${await freePort()}/lark/cb` });
    const a = reg.create(kind, { id: kind }, { now: () => Date.now(), fetch: fetchFn, tokens: tokens(), oauth, consent, resolveIntegration: () => cred, log: quiet });
    try { const f = await a.auth.begin({ origin }); return new URL(f.consentUrl).searchParams.get('redirect_uri'); } finally { oauth.stopAll(); }
  };
  const consent = { sign, publicUrl: () => POD, relayUrl: () => '' };
  const larkSrc = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf8'), gmailSrc = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf8');
  const VIA = "const viaRoute = way.road !== 'loopback' && !!consent && typeof consent.sign === 'function';";
  ok(larkSrc.split(VIA).length === 2 && gmailSrc.split(VIA).length === 2, 'the patch site exists once in each adapter (the road the adapter takes)');
  const realL = await redirectOf(require(path.join(REPO, 'src/channels/lark.js')).adapter, 'lark', CRED, consent, POD);
  const realG = await redirectOf(require(path.join(REPO, 'src/channels/gmail.js')).adapter, 'gmail', GCRED, consent, POD);
  const baseL = await redirectOf(MUT.load('src/channels/lark.js', larkSrc.replace(VIA, 'const viaRoute = false;'), 'base').adapter, 'lark', CRED, consent, POD);
  const baseG = await redirectOf(MUT.load('src/channels/gmail.js', gmailSrc.replace(VIA, 'const viaRoute = false;'), 'base').adapter, 'gmail', GCRED, consent, POD);
  ok(realL === ROUTE_LARK && realG === ROUTE_GMAIL, 'the real adapters, driven alone with the engine\'s consent facts: the route', { realL, realG });
  ok(/^http:\/\/127\.0\.0\.1:\d+/.test(baseL) && /^http:\/\/127\.0\.0\.1:\d+/.test(baseG) && baseL !== ROUTE_LARK && baseG !== ROUTE_GMAIL, 'RED CONTROL = THE BASE: an adapter that never takes the route sends a pod\'s browser to 127.0.0.1 (study 2 B2) — red on the route leg', { baseL, baseG });
  const roadSrc = fs.readFileSync(path.join(REPO, 'src/consent-road.js'), 'utf8');
  const LOCAL = "  if (loopbackOrigin(origin)) return loop('local-browser');\n";
  const blind = MUT.load('src/consent-road.js', roadSrc.replace(LOCAL, ''), 'blind');
  ok(roadSrc.split(LOCAL).length === 2 && blind.consentRoad({ kind: 'lark', publicUrl: POD, origin: 'http://127.0.0.1' }).road === 'route', 'RED CONTROL: a verdict that ignores the browser\'s origin sends a local hub\'s own browser to the route — red on ③\'s local browser');
  // lane oauth-relay-road: RED CONTROL = 2c22424d — the relay never asked (the adapters before this lane): a fleet pod's
  // consent names its OWN route, an address every pod must register — red on ⑦'s fleet leg
  const RELAY_ARG = ', ...CR.relayOf(consent, cred) });';
  const fleetConsent = { sign, publicUrl: () => FLEET, relayUrl: () => PUBLIC_RELAY, fleetRelayUrl: () => ADMIN_RELAY };
  const realFleet = await redirectOf(require(path.join(REPO, 'src/channels/lark.js')).adapter, 'lark', { ...CRED, source: 'cluster' }, fleetConsent, FLEET);
  const baseFleet = await redirectOf(MUT.load('src/channels/lark.js', larkSrc.replace(RELAY_ARG, ' });'), 'norelay').adapter, 'lark', { ...CRED, source: 'cluster' }, fleetConsent, FLEET);
  ok(larkSrc.split(RELAY_ARG).length === 2 && gmailSrc.split(RELAY_ARG).length === 2 && realFleet === ADMIN_RELAY && fleetRedirect === ADMIN_RELAY && baseFleet === `${FLEET}/api/channels/oauth/cb/lark`,
    'RED CONTROL = 2c22424d: an adapter that never asks for the relay sends a fleet pod\'s consent to the POD\'s own route (one registered address per pod) — red on ⑦\'s fleet leg', { realFleet, baseFleet });
  const VERDICT = "  if (page && u && SM.relayTargetVerdict(u, { allow }) === 'redirect') return";
  const anyRelay = MUT.load('src/consent-road.js', roadSrc.replace(VERDICT, "  if (page && u) return"), 'anyrelay');
  const wouldShow = anyRelay.consentRoad({ kind: 'lark', publicUrl: FLEET, origin: FLEET, relayUrl: PUBLIC_RELAY });
  ok(roadSrc.split(VERDICT).length === 2 && wouldShow.road === 'relay' && relayPage.decide(`?code=x-relay-code&state=${encodeURIComponent(CR.stateOf({ origin: FLEET, flowId: 'a1b2c3d4e5f60718', issuedAt: Date.now(), kind: 'lark' }, sign))}`, []).act === 'show-code',
    'RED CONTROL: a verdict that rides ANY configured relay sends a pod through the public page — which only shows the code (a dead end) — red on ①\'s public-page pod row');
  // addendum 1: RED CONTROL = 8725b131 — a preset falls through to the setting (fleet › preset › setting, the setting read
  // for every account): a company preset on a local hub rides the PUBLIC page — red on ①'s preset rows and ⑦'s hub leg
  const PICK = "  if (preset !== null) return own ? { url: own, fleet: true, who: 'preset' } : f ? { url: f, fleet: true, who: 'fleet' } : NO_RELAY;\n";
  const READ = "setting: preset === null ? call('relayUrl') : '' });";
  const was = MUT.load('src/consent-road.js', roadSrc.replace(PICK, "  if (preset !== null) return f ? { url: f, fleet: true, who: 'fleet' } : own ? { url: own, fleet: false, who: 'preset' } : s ? { url: s, fleet: false, who: 'page' } : NO_RELAY;\n").replace(READ, "setting: call('relayUrl') });"), 'preset-default');
  const pubDeps = { fleetRelayUrl: () => '', relayUrl: () => PUBLIC_RELAY };
  const HUBO = `http://127.0.0.1:${await freePort()}`;
  const realHub = CR.consentRoad({ kind: 'lark', publicUrl: '', origin: HUBO, ...CR.relayOf(pubDeps, PRESET({})) });
  const wasHub = was.consentRoad({ kind: 'lark', publicUrl: '', origin: HUBO, ...was.relayOf(pubDeps, PRESET({})) });
  ok(roadSrc.split(PICK).length === 2 && roadSrc.split(READ).length === 2 && realHub.road === 'loopback' && wasHub.road === 'relay' && wasHub.redirectUri === PUBLIC_RELAY,
    'RED CONTROL = 8725b131: a preset that falls through to the setting sends a local hub\'s company sign-in through the PUBLIC page (a page the owner will not register in a company app) — red on ① and ⑦\'s hub preset leg', { real: realHub.road, was: wasHub.redirectUri });
  const rtSrc = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf8');
  const HASHED = "; script-src 'sha256-${CLOSE_SCRIPT_HASH}'";
  ok(rtSrc.split(HASHED).length === 2, 'the route\'s CSP names the close script\'s hash once');
  const noHash = MUT.load('src/routes/channels.js', rtSrc.replace(HASHED, ''), 'nohash');
  const ENGM = ENG;
  {
    const dir = path.join(ROOT, 'nohash'); fs.mkdirSync(dir, { recursive: true });
    const integrations = STORE.create({ dataDir: path.join(dir, 'store'), env: { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'lark', key: 'co', label: 'Company app', values: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark' } }]) }, now: () => Date.now(), broadcast: () => {}, drivePresets: () => [], log: quiet });
    const e = ENGM.create({ dataDir: path.join(dir, 'eng'), env: {}, broadcast: () => {}, integrations, log: quiet, fetch: fetchFn, publicUrl: () => POD });
    noHash.setup({ getEngine: () => e });
    const app = express(); app.use(express.json()); app.use(noHash.router);
    const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const st = await e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: POD });
    const r = await new Promise((resolve) => { http.get(`http://127.0.0.1:${srv.address().port}${landOn(st.url, 'road-lark-code-2')}`, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ csp: String(res.headers['content-security-policy'] || ''), body: b })); }); });
    ok(r.body.includes('<script>') && !r.csp.includes(`sha256-${HASH}`), 'RED CONTROL: the route without the hash still sends the script, which the browser would block — red on ②\'s CSP leg (the tab would stay open)', r.csp);
    try { await e.stop(); } catch {}
    await new Promise((res) => srv.close(res));
  }
}

// ── ⑧ addendum 1: the public page's address in src/ — a person's own app only (grep-derived) ──
console.log('⑧ the public relay page\'s address in src/: only where a person\'s own app reads it');
{
  const files = [];
  const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) walk(p); else if (/\.(c?js|mjs|json|html)$/.test(n.name)) files.push(p); } };
  walk(path.join(REPO, 'src'));
  const hits = (re) => files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f: path.relative(REPO, f), n: i + 1, line: line.trim() })).filter((x) => re.test(x.line)));
  const host = new URL(PUBLIC_RELAY).hostname;
  const lit = hits(new RegExp(host.replace(/\./g, '\\.')));
  const litRole = (x) => (x.f !== 'src/channels/slack-manifest.js' ? null : /^const RELAY_DEFAULT = '/.test(x.line) ? 'the custom setting\'s default' : /^const EGRESS = /.test(x.line) ? 'egress: a custom app\'s browser is sent through it' : null);
  ok(files.length > 100 && lit.length === 2 && lit.every(litRole), `the host ${host} appears in src/ only as slack-manifest.js's RELAY_DEFAULT (the custom setting's default) and EGRESS (a person's own app may send the browser through it) — ${lit.length} lines`, lit.filter((x) => !litRole(x)).map((x) => `${x.f}:${x.n} ${x.line.slice(0, 120)}`));
  const ROLES = [
    [/^\/\/|^\/?\*/, 'a comment'],
    [/^const RELAY_DEFAULT = ('|SM\.RELAY_DEFAULT;)/, 'the definition / its re-export'],
    [/^const \{ RELAY_DEFAULT \} = require\(/, 'an import'],
    [/^(module\.exports = \{|AUTHORIZE_URL, )/, 'an export list'],
    [/^const EGRESS = /, 'the egress line'],
    [/^key: '(slack|lark|gmail)RelayUrl', role: 'relayUrl', type: 'string', default: RELAY_DEFAULT,$/, 'the custom setting\'s default (Settings → Channels)'],
    [/^relayUrlSetting: Object\.freeze\(\{ key: '(slack|lark|gmail)RelayUrl', fallback: (CR|Manifest)\.RELAY_DEFAULT \}\),/, 'a consent row\'s setting fallback (read for a custom app only)'],
    [/^: r\.url === CR\.RELAY_DEFAULT \? tr\('A public relay page you may register if this VibeSpace has no https address'\)$/, 'the custom app\'s setup words'],
    [/^const PUBLIC_RELAY = CR\.RELAY_DEFAULT;/, 'the setup card\'s ① row (a person\'s own app — src/oauth-setup.js never gives it to a preset: ⑨)'],
  ];
  const refs = hits(/\bRELAY_DEFAULT\b/);
  const roleOf = (x) => (ROLES.find(([re]) => re.test(x.line)) || [])[1] || null;
  const stray = refs.filter((x) => !roleOf(x));
  ok(refs.length >= 12 && !stray.length && refs.some((x) => roleOf(x) === 'the custom app\'s setup words'), `every RELAY_DEFAULT reference in src/ (${refs.length}) is a custom-app role or a comment — none reaches a preset row`, stray.map((x) => `${x.f}:${x.n} ${x.line.slice(0, 140)}`));
  const REG = require(path.join(REPO, 'src/integration-registry.js'));
  const presetFields = ['lark', 'gmail', 'slack', 'dropline'].map((id) => (REG.rowById(id).fields || []).find((f) => f.key === 'relayUrl')).filter(Boolean);
  ok(presetFields.length === 4 && presetFields.every((f) => f.default === undefined && !String(f.placeholder || '').includes(host) && !String(f.help || '').includes(host) && !/public page/.test(String(f.help || ''))), 'no registry row\'s relayUrl field (a company preset\'s value) defaults to, shows or names the public page', presetFields.map((f) => [f.key, f.default, f.placeholder]));
}

// ── ⑨ lane oauth-setup-instructions: the Google client's kind + the setup card's addresses ──
console.log('⑨ a Google client\'s kind (Web application / Desktop app) and the setup card\'s exact addresses per instance');
{
  const OS = require(path.join(REPO, 'src/oauth-setup.js'));
  const REG = require(path.join(REPO, 'src/integration-registry.js'));
  const GM = require(path.join(REPO, 'src/channels/gmail.js'));
  const GMAN = require(path.join(REPO, 'src/channels/gmail/manifest.js'));
  const R = (o) => CR.consentRoad(o);
  const HUBO = `http://127.0.0.1:${await freePort()}`;
  // (a) THE VERDICT with a client kind
  const v = {
    desktopFleet: R({ kind: 'gmail', publicUrl: FLEET, origin: FLEET, relayUrl: ADMIN_RELAY, relayFleet: true, clientType: 'desktop' }),
    desktopHub: R({ kind: 'gmail', publicUrl: '', origin: HUBO, relayUrl: PUBLIC_RELAY, clientType: 'desktop' }),
    webHubBare: R({ kind: 'gmail', publicUrl: '', origin: HUBO, relayUrl: '', clientType: 'web' }),
    webHubRelay: R({ kind: 'gmail', publicUrl: '', origin: HUBO, relayUrl: PUBLIC_RELAY, clientType: 'web' }),
    webPod: R({ kind: 'gmail', publicUrl: POD, origin: POD, relayUrl: '', clientType: 'web' }),
    webAsked: R({ kind: 'gmail', publicUrl: POD, origin: POD, road: 'loopback', clientType: 'web' }),
    unsaid: R({ kind: 'gmail', publicUrl: '', origin: HUBO, relayUrl: '' }),
  };
  ok(v.desktopFleet.road === 'loopback' && v.desktopFleet.why === 'desktop-client' && !v.desktopFleet.fixed && v.desktopHub.road === 'loopback' && v.desktopHub.why === 'desktop-client' && !v.desktopHub.fixed,
    'a DESKTOP client takes no https address: never the relay page (the fleet\'s or the public one), never the route — the loopback on any port', { fleet: v.desktopFleet, hub: v.desktopHub });
  ok(v.webHubBare.road === 'loopback' && v.webHubBare.fixed === true && v.webHubBare.why === 'no-address' && v.webAsked.fixed === true && v.webAsked.why === 'asked',
    'a WEB client\'s loopback is the FIXED one (a Web client takes only exact addresses) — a local hub with no relay, and the person\'s other road', { bare: v.webHubBare, asked: v.webAsked });
  ok(v.webHubRelay.road === 'relay' && v.webHubRelay.redirectUri === PUBLIC_RELAY && v.webPod.road === 'route' && v.webPod.redirectUri === ROUTE_GMAIL,
    'a Web client rides the relay page and the route as before (both https)', { relay: v.webHubRelay.road, route: v.webPod.road });
  ok(v.unsaid.road === 'loopback' && !('fixed' in v.unsaid) && CR.WHYS.includes('desktop-client') && JSON.stringify(CR.CLIENT_TYPES) === JSON.stringify(['web', 'desktop']),
    'a client kind not said: the verdict as before (no `fixed` — the adapter\'s own loopback)', v.unsaid);
  ok(GM.clientTypeOf({ clientType: 'desktop' }, { clientType: 'web' }) === 'desktop' && GM.clientTypeOf({ clientType: '' }, { clientType: 'web' }) === 'web' && GM.clientTypeOf({}, {}) === '' && GM.clientTypeOf({ clientType: 'bogus' }, {}) === '',
    'the account\'s own clientType option wins; else what its company preset says; else not said');
  const opt = GM.OPTIONS.find((o) => o.key === 'clientType');
  ok(opt && opt.default === '' && JSON.stringify(opt.choices) === JSON.stringify(['', 'web', 'desktop']) && opt.rebuild === false && GM.consent.callbackUrl === GMAN.GMAIL_LOOPBACK_URL && GM.consent.mode.includes('fixed') && GM.consent.mode.includes('ephemeral'),
    'Gmail\'s option `clientType` (not said / web / desktop) and its consent row: ephemeral + FIXED (the registry row\'s loopback) + public', { opt: opt && opt.choices, mode: GM.consent.mode });
  // the adapter alone: what it hands the loopback machine (a stub records begin's arguments — no port is bound)
  const asked = async (options, values, origin, consent) => {
    const reg = CH.createChannelRegistry(); reg.register(GM.adapter);
    let got = null;
    const oauth = { begin: async (o) => { got = o; return { flowId: 'f1', mode: o.mode, consentUrl: o.buildConsentUrl({ redirectUri: o.redirectUri || o.registeredCallbackUrl || 'http://127.0.0.1:1', state: 's' }) }; }, forwardCallback: async () => ({ ok: false }) };
    const a = reg.create('gmail', { id: 'gmail', options }, { now: () => Date.now(), fetch: fetchFn, tokens: { read: () => ({ token: null, why: 'never-authenticated' }), write: async () => {}, clear: async () => {} }, oauth, consent, resolveIntegration: () => ({ source: 'cluster', values: { clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1', ...values }, missing: [], why: null }), log: quiet });
    await a.auth.begin({ origin });
    return got;
  };
  const hubConsent = { sign, publicUrl: () => '', relayUrl: () => '', fleetRelayUrl: () => '' };
  const gw = await asked({}, { clientType: 'web' }, HUBO, hubConsent);
  const gd = await asked({ clientType: 'desktop' }, { clientType: 'web' }, HUBO, { ...hubConsent, fleetRelayUrl: () => ADMIN_RELAY });
  ok(gw && gw.mode === 'fixed' && gw.registeredCallbackUrl === GMAN.GMAIL_LOOPBACK_URL && gd && gd.mode === 'ephemeral',
    'the Gmail adapter: a Web preset on a local hub binds the registry row\'s FIXED address; the account\'s own «Desktop app» beats the preset and rides the ephemeral port even beside a fleet relay', { web: gw && [gw.mode, gw.registeredCallbackUrl], desktop: gd && gd.mode });
  // (b) THE REAL ENGINE: a company Google client that says it is a Web client
  const w = await world('webclient', { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive: { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1', clientType: 'web' } });
  try {
    const st = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: HUBO });
    const red = new URL(st.url).searchParams.get('redirect_uri');
    ok(st.flow.mode === 'fixed' && red === w.fixed && st.flow.listening === true, 'Connect Gmail on a local hub with a WEB company client: redirect_uri = the FIXED loopback (registrable on a Web client), listening', { mode: st.flow.mode, red });
    seen.length = 0;
    const back = new URL(w.fixed); back.searchParams.set('code', 'road-web-code'); back.searchParams.set('state', new URL(st.url).searchParams.get('state'));
    const landed = await fetch(back.toString()).then((r) => r.status).catch((er) => String(er));
    const done = await waitDone(w.e, st.flowId);
    const gt = seen.find((x) => x.path === '/google-oauth/token');
    ok(landed === 200 && gt && gt.body.redirect_uri === w.fixed && gt.body.code === 'road-web-code' && done && done.ok, 'Google sends the browser to that address: the exchange carries it byte for byte, the flow is done', { landed, redirect: gt && gt.body.redirect_uri, done: done && done.ok });
    const made = await w.e.connect('gmail', { flowId: st.flowId });
    ok(made && made.adapter && made.adapter.options && made.adapter.options.clientType === 'web', 'the new account takes the preset\'s kind as its option (the dialog sent none)', made && made.adapter && made.adapter.options);
    const kg = (w.e.digest({ scope: 'accounts' }).kinds || []).find((k) => k.kind === 'gmail');
    ok(kg && kg.presets[0] && kg.presets[0].facts && kg.presets[0].facts.clientType === 'web' && kg.oauthSetup && kg.oauthSetup.base === POD && kg.oauthSetup.relayPages.length === 0 && JSON.stringify(kg.oauthSetup.presets) === JSON.stringify([{ key: 'org1', relayPage: null, clientType: 'web' }]),
      'the kinds digest: the preset\'s kind as a fact + the setup card\'s facts (this instance\'s https base, no relay page, the preset\'s page and kind)', kg && { facts: kg.presets[0] && kg.presets[0].facts, oauthSetup: kg.oauthSetup });
    const d = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: HUBO, options: { clientType: 'desktop' } });
    ok(d.flow.mode === 'ephemeral' && /^http:\/\/127\.0\.0\.1:\d+$/.test(new URL(d.url).searchParams.get('redirect_uri')), 'the dialog says «Desktop app» ⇒ the ephemeral port (any port — nothing registered)', d.flow.mode);
  } finally { await w.close(); }
  // (c) THE SETUP CARD — the exact addresses this instance needs, per shape (PURE src/oauth-setup.js)
  const G = REG.rowById('gmail').redirect, L = REG.rowById('lark').redirect, S = REG.rowById('slack').redirect, D = REG.rowById('dropline').redirect;
  const keys = (c) => c.rows.map((x) => `${x.key}${x.now ? '*' : ''}`).join(' ');
  const uris = (c) => c.rows.map((x) => x.uri).filter(Boolean);
  const hubPub = OS.setupCard({ kind: 'gmail', redirect: G, base: '', relayPages: [{ url: PUBLIC_RELAY, who: 'page' }], origin: HUBO });
  ok(keys(hubPub) === 'public* own route loopback also' && hubPub.create.key === 'web' && hubPub.create.why === 'relay' && hubPub.create.alt === 'desktop' && JSON.stringify(uris(hubPub)) === JSON.stringify([PUBLIC_RELAY, GMAN.GMAIL_LOOPBACK_URL, G.also[0].uri]) && hubPub.rows[2].tpl === 'https://<host>/api/channels/oauth/cb/gmail',
    'a local hub on the public page: ① the public page (used now), ② your own copy, ③ the https address (template — none here), this machine\'s fixed address, Drive\'s — a Web client (alt: Desktop)', { keys: keys(hubPub), create: hubPub.create });
  const hubBare = OS.setupCard({ kind: 'gmail', redirect: G, base: '', relayPages: [], origin: HUBO });
  const hubBareWeb = OS.setupCard({ kind: 'gmail', redirect: G, base: '', relayPages: [], origin: HUBO, clientType: 'web' });
  const hubBareDesk = OS.setupCard({ kind: 'gmail', redirect: G, base: '', relayPages: [], origin: HUBO, clientType: 'desktop' });
  ok(hubBare.create.key === 'desktop' && hubBare.create.why === 'local' && hubBare.create.alt === 'web' && hubBare.now && hubBare.now.road === 'loopback' && hubBare.now.uri === null && !hubBare.rows.find((x) => x.key === 'public').active
    && keys(hubBareWeb) === 'public own route loopback* also' && !hubBareDesk.rows.some((x) => x.key === 'loopback'),
    'a local hub with no relay page: a Desktop client (any port, nothing to register; alt: Web + the fixed address); said Web ⇒ the fixed address is the one used; said Desktop ⇒ no address row for it', { bare: [keys(hubBare), hubBare.create], web: keys(hubBareWeb), desk: keys(hubBareDesk) });
  const https = OS.setupCard({ kind: 'gmail', redirect: G, base: POD, relayPages: [], origin: POD });
  ok(https.create.key === 'web' && https.create.why === 'https' && https.host === 'pod-road.example.test' && https.rows.find((x) => x.key === 'route').uri === ROUTE_GMAIL && https.now.key === 'route',
    'an instance with its own https address, opened there: a Web client (why: the https address); ③ is the exact route, used now', { keys: keys(https), create: https.create });
  const fleet = OS.setupCard({ kind: 'lark', redirect: L, base: FLEET, relayPages: [{ url: ADMIN_RELAY, who: 'fleet' }, { url: PUBLIC_RELAY, who: 'page' }], origin: FLEET });
  ok(keys(fleet) === 'fleet* route loopback' && !uris(fleet).includes(PUBLIC_RELAY) && fleet.create.key === 'app' && fleet.appWords === L.create && fleet.rows.find((x) => x.key === 'loopback').uri === REG.rowById('lark').setup.callbackUrl,
    'a fleet pod, a person\'s own Lark app: the fleet\'s page (used now — it outranks the setting), the pod\'s route, Lark\'s registered loopback — never the public page', keys(fleet));
  const preset = OS.setupCard({ kind: 'lark', redirect: L, base: FLEET, relayPages: [{ url: PUBLIC_RELAY, who: 'page' }], origin: FLEET, preset: { key: 'co', relayPage: CO_RELAY } });
  const presetBare = OS.setupCard({ kind: 'lark', redirect: L, base: FLEET, relayPages: [{ url: PUBLIC_RELAY, who: 'page' }], origin: FLEET, preset: { key: 'co', relayPage: null } });
  const presetHub = OS.setupCard({ kind: 'lark', redirect: L, base: '', relayPages: [{ url: PUBLIC_RELAY, who: 'page' }], origin: HUBO, preset: { key: 'co', relayPage: null } });
  ok(keys(preset) === 'preset*' && preset.create.key === 'preset' && preset.where === 'preset' && keys(presetBare) === 'presetRoute* loopback' && presetBare.rows[0].uri === `${FLEET}/api/channels/oauth/cb/lark` && keys(presetHub) === 'presetRoute loopback*' && presetHub.rows[0].uri === null
    && ![preset, presetBare, presetHub].some((c) => uris(c).includes(PUBLIC_RELAY)),
    'a COMPANY preset: its relay page only (registered by your admin); without one, this instance\'s own address (or, with no https address, this machine) — the public page NEVER (the fleet presets never show ①)', { preset: keys(preset), bare: keys(presetBare), hub: keys(presetHub) });
  const slack = OS.setupCard({ kind: 'slack', redirect: S, base: POD, relayPages: [{ url: PUBLIC_RELAY, who: 'page' }], origin: POD });
  const drop = OS.setupCard({ kind: 'dropline', redirect: D, base: POD, origin: POD });
  const dropNone = OS.setupCard({ kind: 'dropline', redirect: D, base: '' });
  ok(keys(slack) === 'public* own route' && slack.refusal === S.refusal && drop.who === 'self' && keys(drop) === 'route' && drop.rows[0].uri === `${POD}/api/channels/oauth/cb/dropline` && drop.console === null && drop.refusal === null && dropNone.rows.length === 0,
    'Slack: no loopback (https only), the relay page used; Dropline registers its own client — nothing to create, the one address it registers, no console', { slack: keys(slack), drop: keys(drop) });
  ok(OS.PUBLIC_RELAY === 'https://problemfactory.github.io/vibespace/slack/' && fs.existsSync(path.join(REPO, 'docs/slack-relay/index.html')) && fs.existsSync(path.join(REPO, 'docs/slack-relay/relay.js')),
    'the public relay page is a STABLE contract: https://problemfactory.github.io/vibespace/slack/, published from docs/slack-relay (index.html + relay.js)');
  ok(Object.values(OS.WORDS).every((s) => typeof s === 'string' && s.trim() && !/[<>]/.test(s.replace(/<host>/g, ''))) && [hubPub, hubBare, https, fleet, preset, presetBare, slack, drop].every((c) => c.rows.every((x) => OS.ROW_KEYS.includes(x.key) && OS.rowWords(x))),
    'every card word is a plain string (no markup) and every row has its words');
  // (d) RED CONTROL = c8aa8820 — the client's kind never asked: a Desktop client on a local hub rides the public page, which a Desktop client can never take (redirect_uri_mismatch)
  const roadSrc = fs.readFileSync(path.join(REPO, 'src/consent-road.js'), 'utf8');
  const DESK = "  if (clientType === 'desktop') return loop('desktop-client');";
  const base = MUT.load('src/consent-road.js', roadSrc.replace(DESK, ''), 'nokind');
  const was = base.consentRoad({ kind: 'gmail', publicUrl: '', origin: HUBO, relayUrl: PUBLIC_RELAY, clientType: 'desktop' });
  ok(roadSrc.split(DESK).length === 2 && was.road === 'relay' && was.redirectUri === PUBLIC_RELAY, 'RED CONTROL = c8aa8820: a verdict that never asks the client\'s kind sends a Desktop client through the https relay page — Google refuses it (redirect_uri_mismatch) — red on (a)', was);
}

// ── lane oauth-landing-words: the REAL route ──
console.log('⑪ the landing route: the browser\'s language, the address as typed, a cancelled / replaced / restarted sign-in by name (the REAL engine + routes)');
{
  const CF = /[\w.+-]+@[\w-]+\.[\w.-]+/;   // what Cloudflare's Email Address Obfuscation rewrites
  const w = await world('landing-words');
  let w2 = null;
  const land = (on, p, al) => fetch(`${on.origin}${p}`, { headers: al ? { 'accept-language': al } : {} }).then(async (r) => ({ status: r.status, vary: r.headers.get('vary') || '', csp: r.headers.get('content-security-policy') || '', body: await r.text() }));
  const said = (page, why, l) => page.includes(CR.LANDING_WHY[why][l].split('{name}').join('Lark')) && new RegExp(`<html lang="${l}">`).test(page) && (page.match(/<p[ >]/g) || []).length === 1;
  try {
    // Google from a ja browser: one language, the mailbox as typed (markers + &#64;), the close script, Vary
    const g = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
    const gl = await land(w, landOn(g.url, 'words-google-code'), 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7');
    ok(gl.status === 200 && /data-landing="ok"/.test(gl.body) && /<html lang="ja">/.test(gl.body) && gl.body.includes(CR.LANDING.ok.ja.split('{name}')[0]) && !gl.body.includes('signed in to') && !gl.body.includes('已登录')
      && gl.body.includes('<!--email_off-->ada.road&#64;example.test<!--/email_off-->') && !CF.test(gl.body) && !gl.body.includes('@') && gl.body.includes(`<script>${CR.CLOSE_SCRIPT}</script>`) && gl.csp.includes(`sha256-${HASH}`) && /accept-language/i.test(gl.vary),
      'Google lands from a ja browser: the page is Japanese only, the mailbox is printed inside <!--email_off--> with its @ as &#64; (nothing for a proxy to mask), the tab still closes itself; Vary: Accept-Language', { status: gl.status, vary: gl.vary, body: gl.body.slice(-420) });
    // Lark connected from a zh browser, then its Re-authorize CANCELLED (zh), REPLACED by a newer one (ja), and a state from before a RESTART (en)
    const st = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: POD });
    const ll = await land(w, landOn(st.url, 'words-lark-code'), 'zh-CN,zh;q=0.9,en;q=0.8');
    ok(ll.status === 200 && /<html lang="zh">/.test(ll.body) && /已登录 Lark/.test(ll.body) && /Ada Road/.test(ll.body) && !/signed in to|サインインしました/.test(ll.body), 'Lark lands from a zh browser: the page is Chinese only', ll.body.slice(-300));
    await waitDone(w.e, st.flowId);
    const made = await w.e.connect('lark', { flowId: st.flowId });
    const id = made && made.adapter && made.adapter.id;
    const c1 = await w.e.reauthorize(id, { origin: POD });
    await w.e.cancelAuth(id);
    const cl = await land(w, landOn(c1.flow.consentUrl, 'words-cancelled'), 'zh-CN,zh;q=0.9');
    ok(cl.status === 400 && said(cl.body, 'cancelled', 'zh') && !cl.body.includes(CR.LANDING_WHY.expired.zh) && !/<script/.test(cl.body), 'a Re-authorize the person CANCELLED lands as «cancelled» in their language (zh) — the base said «(expired)»', cl.body.slice(-300));
    const a1 = await w.e.reauthorize(id, { origin: POD });
    const a2 = await w.e.reauthorize(id, { origin: POD });   // the person pressed Re-authorize again
    const sl = await land(w, landOn(a1.flow.consentUrl, 'words-superseded'), 'ja');
    ok(sl.status === 400 && said(sl.body, 'superseded', 'ja') && !sl.body.includes(CR.LANDING_WHY.expired.ja), 'the FIRST of two Re-authorize presses lands as «a newer sign-in was started — finish that one» (ja), never «expired»', sl.body.slice(-300));
    const nl = await land(w, landOn(a2.flow.consentUrl, 'words-no-language'));
    ok(nl.status === 200 && /<html lang="en">/.test(nl.body) && /signed in to Lark/.test(nl.body), 'no language said (fetch\'s own `*`) ⇒ English; the live Re-authorize still lands connected', nl.body.slice(-200));
    // A RESTART: the same route now answers for a NEW engine (a new boot, a new state key — world() rebinds the routes);
    // the state is the first press's, signed by the boot before (the state is judged before any flow is looked up)
    w2 = await world('landing-words-reboot');
    const rl = await land(w, landOn(a1.flow.consentUrl, 'words-restarted'), 'en-US,en;q=0.9');
    ok(rl.status === 400 && said(rl.body, 'bad-hmac', 'en') && /before VibeSpace restarted/.test(rl.body) && !rl.body.includes(CR.LANDING_WHY.expired.en), 'a sign-in started before a restart (the boot before\'s state key) lands as «started before VibeSpace restarted — start it again» (en)', rl.body.slice(-300));
  } finally { await w.close(); if (w2) await w2.close(); }
}

await new Promise((r) => vendor.close(r));
// ── ⑩ lane oauth-relay-one-source: the fleet's relay page has ONE source — the presets' fleet.json ──
console.log('⑩ one source: the fleet\'s relay page from the presets\' fleet.json (live) › the deprecated env › none');
{
  const CP = require(path.join(REPO, 'src/server/cluster-presets.js'));
  const NEW_RELAY = 'https://admin2.fleet.example.test/relay/', MINE_RELAY = 'https://mine.fleet.example.test/relay/';
  const pdir = path.join(ROOT, 'presets-fleet');
  fs.mkdirSync(path.join(pdir, CP.OVERRIDE_DIR), { recursive: true });
  /** a plain presets directory (self-hosting's shape): write / remove one layer's fleet file, then ONE re-read */
  const put = async (r, layer, body) => { const f = layer === 'release' ? path.join(pdir, CP.OVERRIDE_DIR, CP.FILES.fleet) : path.join(pdir, CP.FILES.fleet); if (body === null) fs.rmSync(f, { force: true }); else fs.writeFileSync(f, JSON.stringify(body)); await r.reload(); };
  const said = []; const plog = { log: (...a) => said.push(a.join(' ')), warn: (...a) => said.push('W ' + a.join(' ')), error: (...a) => said.push('E ' + a.join(' ')) };
  fs.writeFileSync(path.join(pdir, CP.FILES.fleet), JSON.stringify({ relayUrl: ADMIN_RELAY }));
  const reader = CP.create({ dir: pdir, log: plog, debounceMs: 20, pollMs: 60000 });
  await reader.start();
  const rd = (st) => new URL(st.url).searchParams.get('redirect_uri');
  const w = await world('one-source', { publicUrl: FLEET, presets: reader });
  try {
    const l = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET });
    const g = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: FLEET });
    const kinds = w.e.digest({ scope: 'accounts' }).kinds || [];
    const presetPages = ['lark', 'gmail'].map((k) => ((kinds.find((x) => x.kind === k) || {}).presets || []).map((x) => x.relayPage).join());
    const fleetPage = (((kinds.find((x) => x.kind === 'lark') || {}).relayPages) || []).find((x) => x.who === 'fleet');
    ok(rd(l) === ADMIN_RELAY && rd(g) === ADMIN_RELAY && l.flow.road === 'relay' && presetPages.join('|') === `${ADMIN_RELAY}|${ADMIN_RELAY}` && fleetPage && fleetPage.url === ADMIN_RELAY && said.some((x) => x.includes(`relay page ${ADMIN_RELAY}`)),
      'a pod with NO relay env: the presets\' fleet.json names the fleet\'s page — Lark and Gmail consents, the digest\'s relayPages and each company preset\'s relayPage all carry it; the boot line names it', { lark: rd(l), gmail: rd(g), presetPages, boot: said[0] });
    said.length = 0;
    await put(reader, 'cluster', { relayUrl: NEW_RELAY });
    const l2 = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET });
    const g2 = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: FLEET });
    const line = said.filter((x) => /\[presets\] changed/.test(x));
    ok(rd(l2) === NEW_RELAY && rd(g2) === NEW_RELAY && line.length === 1 && line[0].includes(`relay page changed (now ${NEW_RELAY})`),
      `a fleet.json edit reaches the NEXT Connect of the RUNNING instance — no restart; ONE journal line: ${line[0]}`, { lark: rd(l2), gmail: rd(g2), said });
    await put(reader, 'release', { relayUrl: MINE_RELAY });
    const l3 = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET });
    ok(rd(l3) === MINE_RELAY && reader.fleet().relayUrl === MINE_RELAY, 'the release\'s override/fleet.json wins over the cluster\'s (like the rows)', rd(l3));
    await put(reader, 'release', { relayUrl: '' });
    const l4 = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET });
    ok(rd(l4) === `${FLEET}/api/channels/oauth/cb/lark` && l4.flow.road === 'route', 'an override relayUrl "" = this release has NO relay page (the presets answered): the pod\'s own route', rd(l4));
    await put(reader, 'release', null);
  } finally { await w.close(); }
  // fleet.json › the deprecated env › none
  {
    const both = await world('one-source-env', { publicUrl: FLEET, presets: reader, env: FLEET_ENV });
    try { const st = await both.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET }); ok(rd(st) === NEW_RELAY, 'fleet.json AND the old env both set: the presets\' page (the env is only the fallback)', rd(st)); } finally { await both.close(); }
    const bare = CP.create({ dir: path.join(ROOT, 'presets-none'), log: quiet });
    const envOnly = await world('one-source-envonly', { publicUrl: FLEET, presets: bare, env: FLEET_ENV });
    try { const st = await envOnly.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET }); ok(rd(st) === ADMIN_RELAY, 'no fleet.json, the old env set: the env\'s page — for ONE release (the deprecated fallback)', rd(st)); } finally { await envOnly.close(); }
    const none = await world('one-source-none', { publicUrl: FLEET, presets: bare });
    try { const st = await none.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET }); ok(rd(st) === `${FLEET}/api/channels/oauth/cb/lark`, 'neither: no fleet relay page — the pod\'s own route', rd(st)); } finally { await none.close(); }
    const lines = []; const cap = { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
    const sOld = STORE.create({ dataDir: path.join(ROOT, 'one-source-said', 'a'), env: FLEET_ENV, presets: reader, log: cap });
    const sNew = STORE.create({ dataDir: path.join(ROOT, 'one-source-said', 'b'), env: {}, presets: reader, log: cap });
    const dep = lines.filter((x) => x.includes('VIBESPACE_OAUTH_RELAY_URL'));
    ok(dep.length === 1 && dep[0].endsWith("VIBESPACE_OAUTH_RELAY_URL is read for the last time: move it to the presets' fleet.json (the chart does)") && sOld.fleetRelayUrl() === NEW_RELAY && sNew.fleetRelayUrl() === NEW_RELAY,
      'the old env set ⇒ ONE boot line, by its words; unset ⇒ none', dep);
    await put(reader, 'release', { relayUrl: '' });
    const blank = sOld.fleetRelayUrl();
    await put(reader, 'release', null);
    ok(blank === '' && sOld.fleetRelayUrl() === NEW_RELAY, 'an override relayUrl "" answers NONE even where the old env is set — a field the presets name is their answer; removed, the cluster\'s page is back', { blank });
  }
  // a preset's own relayUrl wins over the fleet's (both sources)
  {
    const own = await world('one-source-own', { publicUrl: FLEET, presets: reader, env: FLEET_ENV, larkPreset: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', relayUrl: CO_RELAY }, drive: { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1', relayUrl: CO_RELAY } });
    try {
      const l = await own.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin: FLEET });
      const g = await own.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: FLEET });
      ok(rd(l) === CO_RELAY && rd(g) === CO_RELAY, 'a company preset naming its own relayUrl rides it over fleet.json AND the env (relayPick: its own › the fleet\'s)', { lark: rd(l), gmail: rd(g) });
    } finally { await own.close(); }
  }
  // RED CONTROL = ffc8b1ff: the engine read the env — the presets carried the page, the env did not (a pod never restarted)
  {
    const engSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
    const NOW = "  const fleetRelayUrl = () => { try { return integrations && typeof integrations.fleetRelayUrl === 'function' ? String(integrations.fleetRelayUrl() || '').trim() : ''; } catch { return ''; } };";
    const WAS = "  const fleetRelayUrl = () => String((env && env.VIBESPACE_OAUTH_RELAY_URL) || '').trim();";
    const base = MUT.load('src/server/channels-engine.js', engSrc.replace(NOW, WAS), 'env-relay');
    const b = await world('one-source-base', { publicUrl: FLEET, presets: reader, eng: base });
    try {
      const g = await b.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: FLEET });
      ok(engSrc.split(NOW).length === 2 && rd(g) === `${FLEET}/api/channels/oauth/cb/gmail`,
        'RED CONTROL = ffc8b1ff: an engine that reads the relay from its env sends a pod whose presets name the page (and whose env does not) to its OWN route — the redirect_uri_mismatch of 2026-10-23 — red on ⑩\'s first leg', rd(g));
    } finally { await b.close(); }
  }
  reader.stop();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
