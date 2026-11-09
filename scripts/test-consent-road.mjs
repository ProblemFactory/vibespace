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
// lane lark-consent-chain (the owner 2026-10-23, on Lark's «另外 248 项权限»: 「不能一次性打开所有吗？」 — Lark bounds ONE consent page,
// so every permission is pages; ONE press walks them):
//   ⑫ PURE — a chain position (chainOf), the state carries it SIGNED (`c`, round trip; tampered ⇒ bad-hmac; malformed ⇒
//      bad-shape; a state without one is the old shape byte for byte); the landing's chain page (the sentence in each
//      language, a 1 s meta refresh + a link to the NEXT authorize URL, no close script, a non-http next refused) and a
//      declined later page («what you granted on the earlier pages stays»); THE RELAY PAGE (docs/slack-relay/relay.js, as
//      shipped) forwards a chained state VERBATIM; THE REAL ENGINE + ROUTES on the route road (a pod) and the relay road (a
//      fleet pod through the admin's page): one Re-authorize, every page landed in the same tab, the route's CSP unchanged,
//      each next page's state signed with its place, the last page closes the tab, the token holds every permission
// lane gmail-connect-wall (the owner 2026-11-09 on the owner's own hub: a Gmail connect under a company preset walked into
// Google's «Error 400: redirect_uri_mismatch» — the route to the hub's own https address, which no company app lists — and
// the dialog had no way on):
//   ⑬ the road table for company presets (a route ONLY when the preset says `instanceAddress: "listed"`; a silent Google
//      preset = the documented Desktop form — 127.0.0.1, any port, NO path — its other road the fixed address; Web / Desktop
//      / Lark / a fleet relay / a person's own client); routeAllowed / listedOf / relayOf; THE REAL ENGINE in the owner's
//      shape: the any-port loopback, the other road (`fixed`) superseding the earlier sign-in and freeing its port, status
//      ?kind=, the paste that finishes it with the same path-less redirect_uri, oauthCancel + the routes, the digest's
//      presets[].way / oauthSetup.presets[].lacks; a listed preset keeps the route; SLACK's workspace app refused BEFORE
//      Slack opens (preset-unlisted). RED CONTROLS = f5e087bb5's verdict (no preset gate ⇒ the route — the owner's wall)
//      and an engine without the one-pending rule (the earlier sign-in keeps running, its fixed port refuses the next)

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
    [{ kind: 'lark', publicUrl: POD, origin: POD, preset: true }, 'preset-loopback'],   // lane gmail-connect-wall: a company preset that does not say its app lists this address
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
  const pr = { pod: viaPreset(FLEET, FLEET, { relayUrl: CO_RELAY }), hub: viaPreset('', HUB, { relayUrl: CO_RELAY }), lan: viaPreset('', 'http://100.101.102.103:3457', { relayUrl: CO_RELAY }), barePod: viaPreset(FLEET, FLEET, {}), bareHub: viaPreset('', HUB, {}), listedPod: viaPreset(FLEET, FLEET, { instanceAddress: 'listed' }) };
  ok(pr.pod.road === 'relay' && pr.pod.redirectUri === CO_RELAY && pr.pod.u === FLEET && pr.hub.road === 'relay' && pr.hub.u === HUB && pr.lan.road === 'relay',
    'a preset WITH a relay page rides it on every instance: a pod (u = its own https host), a local hub, a hub reached over Tailscale (B-be43: 100.64/10 is private)', pr);
  // lane gmail-connect-wall (law 1): a company preset's person cannot add an address to the app — the route is a preset's road
  // ONLY when the preset says its app lists it (`instanceAddress: "listed"`); else its loopback
  ok(pr.barePod.road === 'loopback' && pr.barePod.why === 'preset-loopback' && pr.bareHub.road === 'loopback' && pr.listedPod.road === 'route' && [pr.barePod, pr.bareHub, pr.listedPod].every((x) => x.redirectUri !== PUBLIC_RELAY),
    'a preset with NO relay page (the setting at the public page) ⇒ its LOOPBACK on a pod (preset-loopback — never the route it cannot list) and on a local hub; the route only when it says `instanceAddress: "listed"` — never the public page', { barePod: [pr.barePod.road, pr.barePod.why], bareHub: pr.bareHub.road, listedPod: pr.listedPod.road });
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
let chainFake = null;   // lane lark-consent-chain: (path, body) → an answer, or null for the fake's own
const vendor = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    let parsed = null;
    try { parsed = /json/.test(String(req.headers['content-type'] || '')) ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body)); } catch { parsed = body; }
    seen.push({ method: req.method, path: u.pathname, body: parsed });
    const j = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (chainFake) { const a = chainFake(u.pathname, parsed); if (a) return j(200, a); }   // lane lark-consent-chain: an app with many permissions
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
// lane gmail-connect-wall: the world's company presets SAY their apps list this instance's own address (`instanceAddress:
// "listed"`) — every route leg below pins the road of such a preset, unchanged; ⑬ walks the presets that say nothing
async function world(tag, { fixedPath = 'lark/cb', publicUrl = POD, larkPreset = { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark', instanceAddress: 'listed' }, env = {}, presets = null, eng = ENG, serverSetting = () => undefined, drive = { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1', instanceAddress: 'listed' } } = {}) {
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
    const integrations = STORE.create({ dataDir: path.join(dir, 'store'), env: { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'lark', key: 'co', label: 'Company app', values: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark', instanceAddress: 'listed' } }]) }, now: () => Date.now(), broadcast: () => {}, drivePresets: () => [], log: quiet });
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
  // lane gmail-connect-wall (R4): under a COMPANY preset the kind is the admin's fact only — the account's option is not read
  ok(GM.clientTypeOf({ clientType: 'desktop' }, { clientType: 'web' }, { preset: true }) === 'web' && GM.clientTypeOf({ clientType: 'desktop' }, {}, { preset: true }) === '' && GM.clientTypeOf({ clientType: 'web' }, { clientType: 'desktop' }, { preset: true }) === 'desktop',
    'R4: a company preset account never reads its own clientType option — the preset says it, or it is not said');
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
  ok(gw && gw.mode === 'fixed' && gw.registeredCallbackUrl === GMAN.GMAIL_LOOPBACK_URL && gd && gd.mode === 'public' && gd.road === 'relay',
    'the Gmail adapter: a Web preset on a local hub binds the registry row\'s FIXED address; R4 (lane gmail-connect-wall): the account\'s own «Desktop app» is NOT read under a company preset — its Web kind rides the fleet relay', { web: gw && [gw.mode, gw.registeredCallbackUrl], desktop: gd && [gd.mode, gd.road] });
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
    ok(kg && kg.presets[0] && kg.presets[0].facts && kg.presets[0].facts.clientType === 'web' && kg.oauthSetup && kg.oauthSetup.base === POD && kg.oauthSetup.relayPages.length === 0 && JSON.stringify(kg.oauthSetup.presets) === JSON.stringify([{ key: 'org1', relayPage: null, clientType: 'web', listed: false, lacks: ['road'] }]) && kg.oauthSetup.presetSource && kg.oauthSetup.presetSource.from === 'env' && kg.oauthSetup.presetSource.env === 'VIBESPACE_GDRIVE_CLIENTS',
      'the kinds digest: the preset\'s kind as a fact + the setup card\'s facts (this instance\'s https base, no relay page, the preset\'s page and kind)', kg && { facts: kg.presets[0] && kg.presets[0].facts, oauthSetup: kg.oauthSetup });
    // lane gmail-connect-wall (R4): the dialog's «Desktop app» on a COMPANY preset is not read (the select is not even shown);
    // on a person's own client it still decides
    const d = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: HUBO, options: { clientType: 'desktop' } });
    const dc = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'custom', clientId: '456-own.apps.googleusercontent.com', clientSecret: 'dummy-own-gsecret-1', origin: HUBO, options: { clientType: 'desktop' } });
    ok(d.flow.mode === 'fixed' && dc.flow.mode === 'ephemeral' && /^http:\/\/127\.0\.0\.1:\d+$/.test(new URL(dc.url).searchParams.get('redirect_uri')), 'R4: «Desktop app» on a company preset changes nothing (its Web kind: the FIXED address); on a person\'s own client ⇒ the ephemeral port (any port — nothing registered)', { preset: d.flow.mode, own: dc.flow.mode });
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
  const presetListed = OS.setupCard({ kind: 'lark', redirect: L, base: FLEET, relayPages: [{ url: PUBLIC_RELAY, who: 'page' }], origin: FLEET, preset: { key: 'co', relayPage: null, listed: true } });
  ok(keys(preset) === 'preset*' && preset.create.key === 'preset' && preset.where === 'preset' && keys(presetBare) === 'presetLoopback loopback*' && presetBare.rows[0].uri === null && keys(presetListed) === 'presetRoute* loopback' && presetListed.rows[0].uri === `${FLEET}/api/channels/oauth/cb/lark` && keys(presetHub) === 'presetRoute loopback*' && presetHub.rows[0].uri === null
    && ![preset, presetBare, presetHub, presetListed].some((c) => uris(c).includes(PUBLIC_RELAY)),
    'a COMPANY preset: its relay page only (registered by your admin); without one, this instance\'s own address ONLY when the preset says its app lists it (lane gmail-connect-wall), else its loopback (the last page pasted back; with no https address, this machine) — the public page NEVER (the fleet presets never show ①)', { preset: keys(preset), bare: keys(presetBare), listed: keys(presetListed), hub: keys(presetHub) });
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

// ── ⑫ lane lark-consent-chain: ONE press, every consent page ──
console.log('⑫ a chain of consent pages: the signed place, the landing that sends the tab on, the relay, the real routes');
{
  const F16 = 'ab'.repeat(8), T0 = Date.now();
  const s2 = CR.stateOf({ origin: POD, flowId: F16, issuedAt: T0, kind: 'lark', chain: { page: 2, total: 3 } }, sign);
  const v2 = CR.stateVerdict(s2, { sign, kind: 'lark' });
  const s0 = CR.stateOf({ origin: POD, flowId: F16, issuedAt: T0, kind: 'lark' }, sign);
  ok(v2.ok && v2.parts.chain && v2.parts.chain.page === 2 && v2.parts.chain.total === 3 && CR.stateVerdict(s0, { sign, kind: 'lark' }).parts.chain === null && !JSON.parse(Buffer.from(s0.split('.')[1], 'base64url').toString()).c && s0 === CR.stateOf({ origin: POD, flowId: F16, issuedAt: T0, kind: 'lark', chain: null }, sign),
    'the state carries the page\'s place SIGNED (`c` = [2, 3] → parts.chain); a state without a chain is the old shape, byte for byte');
  const clearOf = (o) => `v1.${Buffer.from(JSON.stringify(o), 'utf8').toString('base64url')}`;
  const base = { u: POD, f: F16, t: Math.floor(T0 / 1000), k: 'lark' };
  const tampered = `${clearOf({ ...base, c: [1, 3] })}.${s2.split('.')[2]}`;
  ok(CR.stateVerdict(tampered, { sign, kind: 'lark' }).why === 'bad-hmac', 'a page\'s place changed on the way (page 2 → 1, the old signature) ⇒ bad-hmac');
  const bad = [[0, 3], [4, 3], [1, 9], [2], 'x', [1, 1], [2.5, 3]].map((c) => { const cl = clearOf({ ...base, c }); return CR.stateVerdict(`${cl}.${sign(cl)}`, { sign, kind: 'lark' }).why; });
  ok(bad.every((w) => w === 'bad-shape'), `a malformed place, even signed (${bad.length} shapes: page 0, page > total, total > ${CR.CHAIN_PAGES_MAX}, one number, a word, a chain of one, a fraction) ⇒ bad-shape`, bad);
  ok(CR.CHAIN_PAGES_MAX === 5 && CR.chainOf({ page: 5, total: 5 }) && !CR.chainOf({ page: 6, total: 6 }) && !CR.chainOf({ page: 1, total: 1 }) && CR.nextOf({ url: 'https://a.example.test/x?y=1', page: 2, total: 2 }) && !CR.nextOf({ url: 'https://a.example.test/', page: 1, total: 2 }) && !CR.nextOf({ url: 'javascript:alert(1)', page: 2, total: 3 }),
    'a chain is ≤ 5 pages (more means the app enabled something absurd); the NEXT page is page ≥ 2 at an http(s) address — nothing else');
  const NEXT = 'https://accounts.larksuite.com/open-apis/authen/v1/authorize?client_id=cli_a&redirect_uri=x&scope=a+b&state=v1.s';
  const words = { en: 'VibeSpace: page 1/3 of the Lark permissions granted', zh: 'VibeSpace：Lark 第 1/3 页权限已授予', ja: 'VibeSpace：Lark の権限 1/3 ページ目を許可しました' };
  for (const lang of CR.LANGS) {
    const h = CR.landingHtml({ ok: true, user: 'ada.road@example.test', next: { url: NEXT, page: 2, total: 3 } }, { name: 'Lark', lang });
    const esc = NEXT.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    ok(/data-landing="chain"/.test(h) && h.includes(`<meta http-equiv="refresh" content="1;url=${esc}">`) && h.includes(`<a href="${esc}" rel="noreferrer">`) && !h.includes('<script') && h.includes(words[lang]) && h.includes('2/3') && !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(h) && h.includes(`lang="${lang}"`),
      `${lang}: page 1 landed ⇒ «${words[lang]}… 2/3…», then the SAME tab to the next authorize URL after 1 s (a meta refresh — no script, the route's CSP stands; a link too), the address marked, the URL escaped`, h.slice(0, 500));
  }
  const evil = CR.landingHtml({ ok: true, next: { url: 'javascript:alert(1)', page: 2, total: 3 } }, { name: 'Lark', lang: 'en' });
  ok(/data-landing="ok"/.test(evil) && !/refresh/.test(evil) && evil.includes(`<script>${CR.CLOSE_SCRIPT}</script>`), 'a next page at a non-http address is never followed — the page is the plain «connected» one');
  const stop = { en: 'page 2/3 of the Lark permissions was not granted. What you granted on the earlier pages stays', zh: 'Lark 第 2/3 页权限没有授予。前面各页已授予的权限都保留着', ja: 'Lark の権限 2/3 ページ目は許可されませんでした。それまでのページで許可した権限はそのまま残ります' };
  for (const lang of CR.LANGS) {
    const h = CR.landingHtml({ ok: false, why: 'denied', chain: { page: 2, total: 3 } }, { name: 'Lark', lang });
    ok(/data-landing="chain-stopped"/.test(h) && h.includes(stop[lang]) && !/nothing was connected|什么也没连接|何も接続していません/.test(h), `${lang}: a declined page 2 says the earlier pages' grants stay — never «nothing was connected»`, h.slice(0, 300));
  }
  ok(/data-landing="denied"/.test(CR.landingHtml({ ok: false, why: 'denied', chain: { page: 1, total: 3 } }, { name: 'Lark', lang: 'en' })), 'a declined FIRST page is the plain «declined — nothing was connected» (nothing was granted yet)');
  // THE RELAY PAGE, as shipped: a chained state rides it VERBATIM (it reads `u` and `k` only)
  const sR = CR.stateOf({ origin: FLEET, flowId: F16, issuedAt: T0, kind: 'lark', chain: { page: 2, total: 3 } }, sign);
  const q = `code=road-chain-code&state=${encodeURIComponent(sR)}`;
  const d1 = relayPage.decide(`?${q}`, [new URL(FLEET).hostname]);
  ok(d1.act === 'redirect' && d1.to === `${FLEET}/api/channels/oauth/cb/lark?${q}` && new URL(d1.to).searchParams.get('state') === sR && CR.stateVerdict(new URL(d1.to).searchParams.get('state'), { sign, kind: 'lark' }).parts.chain.page === 2,
    'the relay page (docs/slack-relay/relay.js — the admin\'s copy is the same bytes) sends a chained state on to the instance\'s landing VERBATIM — its place still verifies there', d1);
  // THE REAL ENGINE + ROUTES — a fake Lark whose app enabled many permissions (Lark's grants accumulate across pages)
  const granted = new Map(); let grants = new Set(), appList = [], codeN = 0;
  chainFake = (p, body) => {
    if (/\/open-apis\/auth\/v3\/tenant_access_token\/internal$/.test(p)) return { code: 0, tenant_access_token: 't-road-0001', expire: 7200 };
    if (/\/open-apis\/application\/v6\/applications\/me$/.test(p)) return { code: 0, data: { app: { app_id: 'cli_road0001', scopes: appList.map((scope) => ({ scope, token_types: ['user'] })) } } };
    if (/\/open-apis\/authen\/v2\/oauth\/token$/.test(p)) { for (const x of granted.get(body && body.code) || []) grants.add(x); return { code: 0, access_token: `u-chain-${codeN}`, expires_in: 7200, refresh_token: `ur-chain-${codeN}`, refresh_token_expires_in: 604800, scope: [...grants].join(' ') }; }
    return null;
  };
  /** Lark's consent page, pressed «同意»: the code it mints grants exactly what the page asked */
  const agree = (consentUrl) => { const code = `road-chain-${++codeN}`; granted.set(code, new URL(consentUrl).searchParams.get('scope').split(' ')); return code; };
  const refreshOf = (body) => { const m = /<meta http-equiv="refresh" content="1;url=([^"]+)">/.exec(String(body || '')); return m ? m[1].replace(/&amp;/g, '&') : null; };
  const MANY = Array.from({ length: 248 }, (_, i) => `zz:scope${String(i).padStart(3, '0')}:readonly`);
  const walk = async (w, consentUrl, land) => {
    const steps = [];
    for (let u = consentUrl, i = 0; u && i < 6; i++) { const r = await land(u, agree(u)); steps.push({ url: u, ...r }); u = refreshOf(r.body); }
    return steps;
  };
  for (const [tag, opts, origin, viaRelay] of [['chain-route', {}, POD, false], ['chain-relay', { publicUrl: FLEET, env: FLEET_ENV }, FLEET, true]]) {
    grants = new Set(); appList = [];
    const w = await world(tag, opts);
    try {
      const land = viaRelay
        ? async (u, code) => { const d = throughRelay(u, `code=${encodeURIComponent(code)}`, [new URL(FLEET).hostname]); return d.act === 'redirect' ? w.get(new URL(d.to).pathname + new URL(d.to).search) : { status: 0, body: JSON.stringify(d), csp: '' }; }
        : (u, code) => w.get(landOn(u, code));
      const st = await w.e.startOAuth({ kind: 'lark', clientPreset: 'co', origin });
      const FLOOR_R = new URL(st.url).searchParams.get('scope').split(' ');
      await land(st.url, agree(st.url));
      await waitDone(w.e, st.flowId);
      const id = (await w.e.connect('lark', { flowId: st.flowId })).adapter.id;
      appList = [...FLOOR_R, ...MANY];   // the owner enables 248 more on the app
      const r = await w.e.reauthorize(id, { origin });
      const steps = await walk(w, r.flow.consentUrl, land);
      const rec = w.e.adapterRecords().adapters.find((x) => x.id === id);
      const places = steps.slice(1).map((s) => CR.stateVerdict(new URL(s.url).searchParams.get('state'), { sign: (c) => c, kind: 'lark' }));
      const n = r.flow.chain ? r.flow.chain.total : 0;
      const redirect = viaRelay ? ADMIN_RELAY : ROUTE_LARK;
      ok(n >= 3 && steps.length === n && steps.slice(0, -1).every((s, i) => s.status === 200 && /data-landing="chain"/.test(s.body) && s.body.includes(`data-chain="${i + 2}/${n}"`) && !s.body.includes('<script') && s.csp.includes(`script-src 'sha256-${HASH}'`) && /default-src 'none'/.test(s.csp))
        && steps.every((s) => new URL(s.url).searchParams.get('redirect_uri') === redirect && Buffer.byteLength(s.url) <= 3000),
        `${tag}: ONE Re-authorize, ${n} pages in the same tab — each landing sends it on (data-chain 2/${n} … ${n}/${n}) under the route's unchanged CSP; every page rides ${viaRelay ? 'the admin\'s relay page' : 'the instance\'s route'} and is ≤ 3 000 bytes`, steps.map((s) => [s.status, (/data-landing="([a-z-]+)"/.exec(s.body) || [])[1], Buffer.byteLength(s.url)]));
      const last = steps[steps.length - 1] || {};
      ok(/data-landing="ok"/.test(last.body || '') && (last.body || '').includes(`<script>${CR.CLOSE_SCRIPT}</script>`) && appList.every((x) => rec.auth.scopes.includes(x)) && rec.auth.morePending === 0 && !rec.lastAuthError && w.e.adapterView(rec).consentChain === null,
        `${tag}: the last page says connected and closes its tab; the token holds all ${appList.length}; nothing pending, no chain`, { more: rec.auth.morePending, chain: w.e.adapterView(rec).consentChain });
      ok(places.length === n - 1 && places.every((v, i) => v.why === 'bad-hmac') && steps.slice(1).every((s, i) => { const c = JSON.parse(Buffer.from(new URL(s.url).searchParams.get('state').split('.')[1], 'base64url').toString()).c; return Array.isArray(c) && c[0] === i + 2 && c[1] === n; }),
        `${tag}: each next page's state names its place (c = [k, ${n}]) under THIS boot's signature (a stranger's signer refuses it)`);
    } finally { await w.close(); }
  }
  chainFake = null;
}

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

// ── ⑬ lane gmail-connect-wall (the owner 2026-11-09 on the owner's own hub: a Gmail connect under a company preset walked into
// Google's «Error 400: redirect_uri_mismatch» — the route to the hub's own https address, which no company app lists — and
// the dialog had no way on): NO DEFAULT ROAD INTO A PREDICTABLE WALL ──
console.log('⑬ a company preset never rides an address its app does not list; a silent Google preset signs in at the documented Desktop form, the fixed address its visible other road; one pending sign-in per kind');
{
  const R = (o) => CR.consentRoad(o);
  const HUB13 = `http://127.0.0.1:${await freePort()}`;
  const P = (values) => CR.relayOf({ fleetRelayUrl: () => '', relayUrl: () => PUBLIC_RELAY }, PRESET(values));
  const v = (o) => { const x = R(o); return [x.road, x.why, x.fixed ? 'fixed' : (x.road === 'loopback' ? 'any' : x.redirectUri), x.other]; };
  const table = [
    // [the case, the verdict, the want]
    ['gmail silent preset, remote', v({ kind: 'gmail', publicUrl: POD, origin: POD, clientKinds: true, ...P({}) }), ['loopback', 'preset-loopback', 'any', 'fixed']],
    ['gmail silent preset, local hub', v({ kind: 'gmail', publicUrl: POD, origin: HUB13, clientKinds: true, ...P({}) }), ['loopback', 'local-browser', 'any', 'fixed']],
    ['gmail silent preset, asked fixed', v({ kind: 'gmail', publicUrl: POD, origin: POD, clientKinds: true, road: 'fixed', ...P({}) }), ['loopback', 'asked', 'fixed', 'loopback']],
    ['gmail silent preset, asked any port', v({ kind: 'gmail', publicUrl: POD, origin: POD, clientKinds: true, road: 'loopback', ...P({}) }), ['loopback', 'asked', 'any', 'fixed']],
    ['gmail WEB preset, remote', v({ kind: 'gmail', publicUrl: POD, origin: POD, clientKinds: true, clientType: 'web', ...P({ clientType: 'web' }) }), ['loopback', 'preset-loopback', 'fixed', null]],
    ['gmail DESKTOP preset, remote', v({ kind: 'gmail', publicUrl: POD, origin: POD, clientKinds: true, clientType: 'desktop', ...P({ clientType: 'desktop' }) }), ['loopback', 'desktop-client', 'any', null]],
    ['gmail silent preset that LISTS the address', v({ kind: 'gmail', publicUrl: POD, origin: POD, clientKinds: true, ...P({ instanceAddress: 'listed' }) }), ['route', 'https-address', ROUTE_GMAIL, 'loopback']],
    ['gmail preset with its relay page (fleet)', v({ kind: 'gmail', publicUrl: FLEET, origin: FLEET, clientKinds: true, ...CR.relayOf({ fleetRelayUrl: () => ADMIN_RELAY }, PRESET({})) }), ['relay', 'relay-page', ADMIN_RELAY, 'loopback']],
    ['lark preset, remote', v({ kind: 'lark', publicUrl: POD, origin: POD, ...P({}) }), ['loopback', 'preset-loopback', 'any', null]],
    ['lark preset that LISTS the address', v({ kind: 'lark', publicUrl: POD, origin: POD, ...P({ instanceAddress: 'listed' }) }), ['route', 'https-address', ROUTE_LARK, 'loopback']],
    ['a person\'s OWN gmail client, remote (untouched)', v({ kind: 'gmail', publicUrl: POD, origin: POD, clientKinds: true, ...CR.relayOf({ relayUrl: () => '' }, { source: 'user', values: {} }) }), ['route', 'https-address', ROUTE_GMAIL, 'loopback']],
    ['a person\'s OWN gmail client, local hub (untouched)', v({ kind: 'gmail', publicUrl: POD, origin: HUB13, clientKinds: true, ...CR.relayOf({ relayUrl: () => '' }, { source: 'user', values: {} }) }), ['loopback', 'local-browser', 'any', null]],
  ];
  const off = table.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want));
  ok(!off.length, `the road table (${table.length} rows): a company preset's route ONLY when it says its app lists the address; a silent Google preset = the documented Desktop form (any port, no path), the FIXED address its other road (and back); a Web preset its fixed address; a Desktop preset any port; Lark its registered loopback; a fleet relay unchanged; a person's own client unchanged`, off);
  ok(CR.routeAllowed({}) && CR.routeAllowed({ preset: false }) && !CR.routeAllowed({ preset: true }) && CR.routeAllowed({ preset: true, listed: true }) && CR.listedOf({ instanceAddress: 'listed' }) && !CR.listedOf({ instanceAddress: 'yes' }) && !CR.listedOf(null) && CR.LISTED === 'listed',
    'routeAllowed / listedOf: a person\'s own client, or a preset whose values say `instanceAddress: "listed"` — exactly that word');
  const rp = [P({}), P({ instanceAddress: 'listed' }), CR.relayOf({ relayUrl: () => '' }, { source: 'user', values: { instanceAddress: 'listed' } })];
  ok(rp[0].preset === true && rp[0].listed === false && rp[1].listed === true && rp[2].preset === false && rp[2].listed === false, 'relayOf answers preset + listed (a person\'s own client never "lists" — the fact is a preset\'s)', rp);
  // the dialog's other road is a verdict field on EVERY road (never derived in the client)
  ok(['relay', 'route', 'loopback'].every((road) => table.some(([, got]) => got[0] === road)) && table.every(([, got]) => got[3] === null || CR.ASKED_ROADS.includes(got[3])), 'every verdict names its other road (null | loopback | fixed) — the dialog\'s visible second button');

  // (b) THE REAL ENGINE — the owner's shape: a silent company Google preset, an https address, a browser elsewhere
  const SILENT = { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1' };
  const w = await world('wall', { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive: SILENT, larkPreset: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark' } });
  try {
    const a = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
    const ra = new URL(a.url).searchParams.get('redirect_uri');
    ok(a.flow.mode === 'ephemeral' && /^http:\/\/127\.0\.0\.1:\d+$/.test(ra) && a.flow.other === 'fixed' && !a.superseded,
      'Connect Gmail under a silent company preset from another computer: redirect_uri = 127.0.0.1 on a free port with NO path (Google\'s documented Desktop form) — never the instance\'s own address; the flow names its other road', { mode: a.flow.mode, ra, other: a.flow.other });
    const b = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD, road: 'fixed' });
    const sa = w.e.oauthStatus(a.flowId);
    ok(b.flow.mode === 'fixed' && new URL(b.url).searchParams.get('redirect_uri') === w.fixed && b.flow.listening === true && b.superseded === 1 && b.flow.other === 'loopback' && sa.running === false && /superseded/.test(String(sa.error || (sa.flow && sa.flow.cancelled))),
      'the other road (asked `fixed`): the FIXED address, listening; the earlier sign-in is replaced (superseded — said once by the answer), never left running beside it', { b: [b.flow.mode, b.superseded, b.flow.other], a: { running: sa.running, error: sa.error } });
    const c = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD, road: 'fixed' });
    ok(c.flow.mode === 'fixed' && c.flow.listening === true && c.superseded === 1 && !(c.flow.refusal), 'a third press on the fixed address: the earlier one is superseded FIRST, so the port is free — listening, no port-busy refusal', { listening: c.flow.listening, refusal: c.flow.refusal });
    const byKind = w.e.oauthStatus(null, { kind: 'gmail' });
    let larkNone = null; try { w.e.oauthStatus(null, { kind: 'lark' }); } catch (er) { larkNone = er.code; }
    ok(byKind.flowId === c.flowId && byKind.running === true && larkNone === 'no-flow', 'status ?kind= answers the latest sign-in of THAT kind (a reopened dialog finds its own) — none of another kind', { byKind: byKind.flowId === c.flowId, larkNone });
    // the paste completes the owner's road: the last page's address (127.0.0.1, never loaded) handed back
    const d = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
    const back = new URL(new URL(d.url).searchParams.get('redirect_uri') + '/'); back.searchParams.set('state', new URL(d.url).searchParams.get('state')); back.searchParams.set('code', 'wall-paste-code');
    seen.length = 0;
    const pasted = await w.e.oauthCallback({ url: back.toString(), flowId: d.flowId });
    const done = await waitDone(w.e, d.flowId);
    const tk = seen.find((x) => x.path === '/google-oauth/token');
    ok(pasted.ok && done.ok && tk && /^http:\/\/127\.0\.0\.1:\d+$/.test(tk.body.redirect_uri) && tk.body.code === 'wall-paste-code', 'the person pastes the last page\'s address: the hub finishes the exchange with the SAME path-less redirect_uri — signed in', { pasted: pasted.ok, done: done && done.ok, redirect: tk && tk.body.redirect_uri });
    // cancel: one press, said by its answer; a second press finds it ended
    const f = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
    const c1 = w.e.oauthCancel(f.flowId), c2 = w.e.oauthCancel(f.flowId), sf = w.e.oauthStatus(f.flowId);
    let noId = null; try { w.e.oauthCancel(null); } catch (er) { noId = er.code; }
    ok(c1.cancelled === true && c2.cancelled === false && sf.running === false && /cancel/i.test(String(sf.error || '')) && noId === 'no-flow', 'oauthCancel: ends a running sign-in in one call (cancelled), a second finds it ended, the status says cancelled; no id ⇒ refused by name', { c1, c2, error: sf.error, noId });
    // the route: POST /api/channels/oauth/cancel (owner-only like its siblings) and GET status?kind=
    const g = await w.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
    const post = (p, body) => new Promise((resolve) => { const rq = http.request(`${w.origin}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => { let s = ''; res.on('data', (x) => { s += x; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, json: j }); }); }); rq.end(JSON.stringify(body)); });
    const rs = await w.get(`/api/channels/oauth/status?kind=gmail`);
    const rc = await post('/api/channels/oauth/cancel', { flowId: g.flowId });
    const rx = await post('/api/channels/oauth/cancel', {});
    ok(rs.status === 200 && JSON.parse(rs.body).flowId === g.flowId && rc.status === 200 && rc.json && rc.json.ok === true && rc.json.cancelled === true && rx.status === 400, 'the routes: GET /api/channels/oauth/status?kind=gmail names the running one; POST /api/channels/oauth/cancel {flowId} ends it; no flowId ⇒ 400', { status: rs.status, cancel: rc.json, none: rx.status });
    // the digest: each preset's road for a browser elsewhere (the dialog's words BEFORE the press) + what it does not say
    const kg = (w.e.digest({ scope: 'accounts' }).kinds || []).find((k) => k.kind === 'gmail');
    const kl = (w.e.digest({ scope: 'accounts' }).kinds || []).find((k) => k.kind === 'lark');
    const wg = kg && CR.wayOf({ kind: 'gmail', origin: POD, inputs: kg.presets[0].wayIn }), wl = kl && CR.wayOf({ kind: 'lark', origin: POD, inputs: kl.presets[0].wayIn });
    ok(kg && JSON.stringify(wg) === JSON.stringify({ road: 'loopback', why: 'preset-loopback', fixed: false, other: 'fixed', uri: null }) && wl && wl.road === 'loopback' && wl.why === 'preset-loopback'
      && JSON.stringify(kg.oauthSetup.presets[0].lacks) === JSON.stringify(['clientType', 'road']) && kg.oauthSetup.presets[0].listed === false,
      'the kinds digest: presets[].wayIn = the START\'s own inputs, read in the page by wayOf with the page\'s origin (Gmail: the loopback, its other road the fixed address; Lark: its loopback); oauthSetup.presets[].lacks = what the preset does not say (the client\'s kind, a way back)', { gmail: wg, lark: wl, lacks: kg && kg.oauthSetup.presets[0].lacks });
  } finally { await w.close(); }
  // a LISTED preset keeps the route; the digest says so (nothing about pasting)
  const wl = await world('wall-listed', { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive: { ...SILENT, instanceAddress: 'listed' } });
  try {
    const l = await wl.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
    const kg = (wl.e.digest({ scope: 'accounts' }).kinds || []).find((k) => k.kind === 'gmail');
    const wy = CR.wayOf({ kind: 'gmail', origin: POD, inputs: kg.presets[0].wayIn });
    ok(l.flow.mode === 'public' && new URL(l.url).searchParams.get('redirect_uri') === ROUTE_GMAIL && wy.road === 'route' && wy.uri === ROUTE_GMAIL && JSON.stringify(kg.oauthSetup.presets[0].lacks) === JSON.stringify(['clientType']),
      'a preset that says `instanceAddress: "listed"`: the route, as before; its way says so and its lacks no longer name a way back', { mode: l.flow.mode, way: wy, lacks: kg.oauthSetup.presets[0].lacks });
  } finally { await wl.close(); }
  // (c) SLACK — the same law on its own road (src/channels/slack.js asks CR.routeAllowed)
  const slackWorld = async (tag, values, extraEnv = {}) => {
    const dir = path.join(ROOT, tag); fs.mkdirSync(dir, { recursive: true });
    const integrations = STORE.create({ dataDir: path.join(dir, 'store'), env: { ...extraEnv, VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'slack', key: 'ws', label: 'Workspace app', values: { clientId: '1234567890.1234567890', clientSecret: 'dummy-slack-ws-secret-1', ...values } }]) }, now: () => Date.now(), broadcast: () => {}, drivePresets: () => [], log: quiet });
    const oauth = OL.createOAuthLoopback({ log: quiet });
    const e = ENG.create({ dataDir: path.join(dir, 'eng'), env: {}, serverSetting: () => undefined, broadcast: () => {}, integrations, log: quiet, fetch: fetchFn, oauth, publicUrl: () => POD });
    return { e, close: async () => { try { oauth.stopAll(); } catch {} try { await e.stop(); } catch {} } };
  };
  const s0 = await slackWorld('wall-slack', {});
  const s1 = await slackWorld('wall-slack-listed', { instanceAddress: 'listed' });
  try {
    let refused = null; try { await s0.e.startOAuth({ kind: 'slack', clientPreset: 'ws', origin: POD }); } catch (er) { refused = { code: er.code, why: er.detail && er.detail.why, msg: String(er.message) }; }
    const okl = await s1.e.startOAuth({ kind: 'slack', clientPreset: 'ws', origin: POD });
    const ks = (s0.e.digest({ scope: 'accounts' }).kinds || []).find((k) => k.kind === 'slack');
    const wsl = ks && CR.wayOf({ kind: 'slack', origin: POD, inputs: ks.presets[0].wayIn });
    ok(refused && refused.why === 'preset-unlisted' && /make your own app/.test(refused.msg) && new URL(okl.url).searchParams.get('redirect_uri') === `${POD}/api/channels/oauth/cb/slack` && wsl && wsl.road === 'none',
      'SLACK (R3, the same law): a company workspace app with no relay page that does not list this address is refused BEFORE Slack is opened (preset-unlisted — the other way named), wayOf over its digest inputs says `none` for the dialog; listed ⇒ this instance\'s own address', { refused, listed: new URL(okl.url).searchParams.get('redirect_uri'), way: wsl });
    // r2 (law C): a begin that is REFUSED leaves the earlier sign-in of its kind running — nothing replaced it
    const keep = await s1.e.startOAuth({ kind: 'slack', clientPreset: 'ws', origin: POD });
    let refused2 = null; try { await s1.e.startOAuth({ kind: 'slack', clientPreset: 'ws', origin: 'http://pod-road.example.test:3456' }); } catch (er) { refused2 = er.detail && er.detail.why; }
    ok(refused2 === 'no-https' && s1.e.oauthStatus(keep.flowId).running === true, 'r2 LAW C: a press whose begin is refused (an http page under a Slack company app) leaves the earlier sign-in RUNNING — its landing still finishes it, never «replaced» by nothing', { refused2, running: s1.e.oauthStatus(keep.flowId).running });
  } finally { await s0.close(); await s1.close(); }
  // ── r2 (the acceptance of 4c73941e6) ──
  // LAW A: ONE sign-in per kind when two starts OVERLAP — the place is taken before anything is awaited
  const wo = await world('wall-overlap', { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive: SILENT });
  try {
    const [x, y] = await Promise.all([wo.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD }), wo.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD })]);
    const run2 = [x, y].filter((f) => wo.e.oauthStatus(f.flowId).running).length;
    ok(run2 === 1 && wo.e.oauthStatus(y.flowId).running === true && y.superseded === 1 && /superseded/.test(String(wo.e.oauthStatus(x.flowId).error || '')), 'r2 LAW A: two OVERLAPPING Gmail starts (any port) ⇒ ONE runs — the second ends the first by name (superseded 1), never two on two ports', { running: run2, superseded: [x.superseded || 0, y.superseded || 0] });
    const [f1, f2] = await Promise.all([wo.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD, road: 'fixed' }), wo.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD, road: 'fixed' })]);
    const s2 = wo.e.oauthStatus(f2.flowId);
    ok(wo.e.oauthStatus(f1.flowId).running === false && s2.running === true && s2.flow.listening === true && !s2.flow.refusal && f2.superseded >= 1, 'r2 LAW A: two OVERLAPPING starts on the FIXED road ⇒ the second ends the first and LISTENS on the port (no «port-busy»)', { first: wo.e.oauthStatus(f1.flowId).running, listening: s2.flow.listening, refusal: s2.flow.refusal && s2.flow.refusal.code });
    // LAW E4: an asked road that is not a known word is refused by name — the engine and the route
    let bad = null; try { await wo.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD, road: 'fixd' }); } catch (er) { bad = er.code; }
    const postR = (p, body) => new Promise((resolve) => { const rq = http.request(`${wo.origin}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => { let s = ''; res.on('data', (q) => { s += q; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, json: j }); }); }); rq.end(JSON.stringify(body)); });
    const rb = await postR('/api/channels/oauth/start', { kind: 'gmail', clientPreset: 'org1', road: 'bogus' });
    ok(bad === 'bad-road' && rb.status === 400 && rb.json && (rb.json.code === 'bad-road' || /bad-road/.test(JSON.stringify(rb.json))), 'r2 LAW E4: an asked road that is not loopback / fixed is REFUSED by name (bad-road) — the engine and POST /api/channels/oauth/start — never silently the verdict\'s own', { engine: bad, route: rb.status });
  } finally { await wo.close(); }
  // LAW D: ONE verdict, two readers — wayOf over the digest's inputs + the page's origin = the road the start takes
  const ORIGINS = [POD, 'http://pod-road.example.test:3456', 'https://other-name.example.test', 'http://192.168.7.20:3456', `http://127.0.0.1:${await freePort()}`];
  const roadOfStart = (st) => (st.flow.mode === 'public' ? `${st.flow.road}:${st.flow.redirectUri}` : `loopback:${st.flow.mode === 'fixed' ? 'fixed' : 'any'}`);
  const roadOfWay = (w) => (w.road === 'loopback' ? `loopback:${w.fixed ? 'fixed' : 'any'}` : `${w.road}:${w.uri}`);
  const OWN_RELAY = 'https://relay.company.example.test/relay/';
  const cells = [], off13 = [];
  for (const [name, drive, lark] of [['silent', SILENT, { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark' }], ['own relay', { ...SILENT, relayUrl: OWN_RELAY }, { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark', relayUrl: OWN_RELAY }], ['listed', { ...SILENT, instanceAddress: 'listed' }, { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark', instanceAddress: 'listed' }], ['web', { ...SILENT, clientType: 'web' }, null]]) {
    const wd = await world(`wall-d-${name.replace(/\s/g, '')}`, { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive, ...(lark ? { larkPreset: lark } : {}) });
    try {
      const kinds = wd.e.digest({ scope: 'accounts' }).kinds || [];
      for (const [kind, key] of [['gmail', 'org1'], ...(lark ? [['lark', 'co']] : [])]) {
        const inputs = kinds.find((k) => k.kind === kind).presets.find((p) => p.key === key).wayIn;
        for (const origin of ORIGINS) {
          const st = await wd.e.startOAuth({ kind, clientPreset: key, origin });
          const a13 = roadOfWay(CR.wayOf({ kind, origin, inputs })), b13 = roadOfStart(st);
          cells.push(1); if (a13 !== b13) off13.push({ name, kind, origin, stateA: a13, start: b13 });
        }
      }
    } finally { await wd.close(); }
  }
  ok(cells.length >= 30 && !off13.length, `r2 LAW D: ${cells.length} cells (presets silent / own relay / listed / web × Gmail, Lark × pages at the instance's own address, a public http name, another https name, a LAN address, this machine): wayOf over the digest's inputs with the page's origin = the road the START takes, every cell`, off13);
  // …and Slack's own road (no loopback): wayOf over its digest inputs = the start (a relay, its own https address when listed,
  // `none` = the start is refused before Slack opens)
  const offS = []; let cellsS = 0;
  for (const [name, values] of [['silent', {}], ['own relay', { relayUrl: OWN_RELAY }], ['listed', { instanceAddress: 'listed' }]]) {
    const sw = await slackWorld(`wall-d-slack-${name.replace(/\s/g, '')}`, values);
    try {
      const inputs = (sw.e.digest({ scope: 'accounts' }).kinds || []).find((k) => k.kind === 'slack').presets.find((p) => p.key === 'ws').wayIn;
      for (const origin of ORIGINS) {
        let st = null; try { st = await sw.e.startOAuth({ kind: 'slack', clientPreset: 'ws', origin }); } catch { st = null; }
        const w = CR.wayOf({ kind: 'slack', origin, inputs });
        const a = w.road === 'none' ? 'none' : w.uri, b = st ? st.flow.redirectUri : 'none';
        cellsS++; if (a !== b) offS.push({ name, origin, stateA: a, start: b });
      }
    } finally { await sw.close(); }
  }
  ok(cellsS === 15 && !offS.length, `r2 LAW D (Slack's own road): ${cellsS} cells — wayOf = the start (its relay, its own https address when listed, \`none\` ⇔ refused before Slack opens)`, offS);
  // r3 (law D's admin-typo cell): a Slack company preset whose relay address is MALFORMED, on a fleet that has a relay page —
  // the picture and the start ask ONE function (relayPick): both fall back to the fleet's page, on every origin
  {
    const sm = await slackWorld('wall-d-slack-typo', { relayUrl: 'http://relay.company.example.test/relay/' }, { VIBESPACE_OAUTH_RELAY_URL: ADMIN_RELAY });
    try {
      const inputs = (sm.e.digest({ scope: 'accounts' }).kinds || []).find((k) => k.kind === 'slack').presets.find((p) => p.key === 'ws').wayIn;
      const offT = [];
      for (const origin of ORIGINS.slice(0, 4)) {
        let st = null, why = null; try { st = await sm.e.startOAuth({ kind: 'slack', clientPreset: 'ws', origin }); } catch (er) { why = er.detail && er.detail.why; }
        const w = CR.wayOf({ kind: 'slack', origin, inputs });
        if (!(st && w.road === 'relay' && w.uri === ADMIN_RELAY && st.flow.redirectUri === ADMIN_RELAY)) offT.push({ origin, way: w.road, start: st ? st.flow.redirectUri : why });
      }
      ok(!offT.length, 'r3 LAW D (the admin-typo cell): a Slack company preset with a MALFORMED relay address on a fleet with a relay page — the picture and the start both ride the fleet\'s page (relayPick, one function), 4 of 4 origins', offT);
    } finally { await sm.close(); }
  }
  // r3 (item 1b): the «it is a Desktop app client» CLAIM is a PURE decision (src/oauth-setup.js refusalKeys) — never for a company
  // preset; and the guard is what keeps it out (a copy without it draws it)
  const OS = require(path.join(REPO, 'src/oauth-setup.js'));
  const OSsrc = fs.readFileSync(path.join(REPO, 'src/oauth-setup.js'), 'utf8');
  const GUARD = 'clientTypes && https && !preset ?';
  const OSm = MUT.load('src/oauth-setup.js', OSsrc.replace(GUARD, 'clientTypes && https ?'), 'noclaimguard13');
  const kOwn = OS.refusalKeys({ clientTypes: true, https: true, preset: false }), kPre = OS.refusalKeys({ clientTypes: true, https: true, preset: true });
  ok(kOwn.includes('refusal.desktop') && !kPre.includes('refusal.desktop') && kPre.includes('refusal') && /The client is a Desktop app client/.test(OS.WORDS['refusal.desktop']),
    'r3 PIN (law 3): refusalKeys draws the «The client is a Desktop app client» claim for a person\'s OWN client on an https road, NEVER for a company preset (the refusal lines stay)', { own: kOwn, preset: kPre });
  ok(OSsrc.split(GUARD).length === 2 && OSm.refusalKeys({ clientTypes: true, https: true, preset: true }).includes('refusal.desktop'), 'RED CONTROL (r3 PIN, law 3): without the preset guard the claim is drawn for a company preset — red on the leg above');
  // r3 (item 5): NO START WAITS FOR EVER on another start — a begin that hangs past the bound: the next start goes ahead (said),
  // the late one ends itself when it answers; still ONE sign-in. (A patched copy with a 300 ms bound — the real one is 20 s.)
  {
    const authSrcW = fs.readFileSync(path.join(REPO, 'src/server/channels-auth.js'), 'utf8');
    const BOUND = 'const START_WAIT_MS = 20e3;';
    const authW = MUT.write('src/server/channels-auth.js', authSrcW.replace(BOUND, 'const START_WAIT_MS = 300;'), 'startwait13');
    const engSrcW = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
    const engW = MUT.load('src/server/channels-engine.js', engSrcW.replace("require('./channels-auth.js')", `require(${JSON.stringify(authW)})`), 'startwait13');
    const ww = await world('wall-hung', { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive: SILENT, eng: engW });
    try {
      const b0 = ww.oauth.begin; let first = true;
      ww.oauth.begin = async (o) => { if (first) { first = false; await sleep(1500); } return b0(o); };   // the FIRST begin hangs 1.5 s
      let lateDone = false;   // an ORDER, never a clock bound (test-ci-gate's ratchet): the next start answers BEFORE the hung one
      const late = ww.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD }).then((x) => { lateDone = true; return { ok: x }; }, (er) => { lateDone = true; return { err: er }; });
      await sleep(30);
      const next = await ww.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD });
      const answeredFirst = !lateDone;
      const lateR = await late;
      await sleep(50);
      const running = ww.e.oauthStatus(next.flowId).running;
      ok(authSrcW.split(BOUND).length === 2 && answeredFirst && running === true && lateR.err && lateR.err.code === 'superseded',
        'r3 item 5: a begin that HANGS past the bound — the next start goes ahead and ANSWERS FIRST (it waited the bound, not the hang), the late one ends itself when it answers (409 superseded): one sign-in, never a kind blocked for ever', { answeredFirst, running, late: lateR.err ? lateR.err.code : 'answered' });
    } finally { await ww.close(); }
  }
  // …the shape the acceptance suspected, as r1 computed it (the instance's own origin for every page): it told a page opened
  // under ANOTHER name «comes back by itself» while the start took the loopback — the reproduction r2 removes
  const insOwn = CR.relayOf({ fleetRelayUrl: () => '' }, PRESET({ relayUrl: OWN_RELAY }));
  const r1Said = CR.consentRoad({ kind: 'gmail', publicUrl: POD, origin: POD, relayUrl: insOwn.relayUrl, relayFleet: true, preset: true, listed: false, clientKinds: true });
  const truth = CR.consentRoad({ kind: 'gmail', publicUrl: POD, origin: 'http://pod-road.example.test:3456', ...insOwn, clientKinds: true });
  ok(r1Said.road === 'relay' && truth.road === 'loopback' && CR.wayOf({ kind: 'gmail', origin: 'http://pod-road.example.test:3456', inputs: { publicUrl: POD, ...insOwn, clientType: '', clientKinds: true, loopback: true } }).road === 'loopback', 'r2 LAW D, REPRODUCED then fixed: r1\'s state A (the instance\'s own origin for every page) said «relay» for a preset\'s own relay page on a page opened under a public http name, the start took the loopback; wayOf over the page\'s own origin says the loopback', { r1: r1Said.road, start: truth.road });
  // LAW E3: only the exact string "listed" counts — an array (stringified by the reader) never puts a company app back on its own address
  const PL13 = require(path.join(REPO, 'src/preset-layers.js'));
  const ents = PL13.parseIntegrations([{ id: 'lark', key: 'a', values: { appId: 'x', appSecret: 'y', instanceAddress: ['listed'] } }, { id: 'lark', key: 'b', values: { appId: 'x', appSecret: 'y', instanceAddress: 'listed' } }, { id: 'slack', key: 'c', values: { clientId: 'x', clientSecret: 'y', instanceAddress: { v: 'listed' } } }]);
  ok(ents[0].values.instanceAddress === '' && ents[1].values.instanceAddress === 'listed' && ents[2].values.instanceAddress === '' && !CR.listedOf(ents[0].values) && CR.listedOf(ents[1].values), 'r2 LAW E3: `instanceAddress: ["listed"]` (or an object) is NOT listed — the integrations reader keeps only the exact string', ents.map((e) => e.values.instanceAddress));
  // RED CONTROL for LAW A: an engine without the per-kind place (its chain never set) lets two overlapping starts run side by side
  {
    const authSrcA = fs.readFileSync(path.join(REPO, 'src/server/channels-auth.js'), 'utf8');
    const SET = '      startChain.set(mod.kind, entry);';
    const authMutA = MUT.write('src/server/channels-auth.js', authSrcA.replace(SET, ''), 'nochain13');
    const engSrcA = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
    const engMutA = MUT.load('src/server/channels-engine.js', engSrcA.replace("require('./channels-auth.js')", `require(${JSON.stringify(authMutA)})`), 'nochain13');
    const wm2 = await world('wall-nochain', { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive: SILENT, eng: engMutA });
    try {
      const [x, y] = await Promise.all([wm2.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD }), wm2.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD })]);
      const both = [x, y].filter((f) => wm2.e.oauthStatus(f.flowId).running).length;
      ok(authSrcA.split(SET).length === 2 && both === 2, 'RED CONTROL (r2 LAW A): without the per-kind place two overlapping starts both run (superseded 0) — the acceptance\'s reproduction, red on the overlap leg', { running: both });
    } finally { await wm2.close(); }
  }
  // (d) RED CONTROLS (mutant copies): the base verdict (no preset gate) and the base engine (no one-pending rule)
  const crSrc = fs.readFileSync(path.join(REPO, 'src/consent-road.js'), 'utf8');
  const GATE = "  if (!routeAllowed({ preset, listed })) return loop('preset-loopback');\n";
  const noGate = MUT.load('src/consent-road.js', crSrc.replace(GATE, ''), 'nogate13');
  const was = noGate.consentRoad({ kind: 'gmail', publicUrl: POD, origin: POD, clientKinds: true, ...P({}) });
  ok(crSrc.split(GATE).length === 2 && was.road === 'route' && was.redirectUri === ROUTE_GMAIL, 'RED CONTROL = f5e087bb5\'s verdict: without the preset gate a silent company preset rides the instance\'s own https address — the owner\'s redirect_uri_mismatch — red on ⑬\'s first table row', { road: was.road, redirect: was.redirectUri });
  const authSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-auth.js'), 'utf8');
  const ONE = "    const earlier = target ? [] :";   // r2: the earlier sign-ins of the kind, found after the per-kind place
  const authMut = MUT.write('src/server/channels-auth.js', authSrc.replace(ONE, '    const earlier = true ? [] :'), 'nosupersede13');
  const engSrc13 = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const engMut = MUT.load('src/server/channels-engine.js', engSrc13.replace("require('./channels-auth.js')", `require(${JSON.stringify(authMut)})`), 'nosupersede13');
  const wm = await world('wall-mut', { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive: SILENT, eng: engMut });
  try {
    const a = await wm.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD, road: 'fixed' });
    const b = await wm.e.startOAuth({ kind: 'gmail', clientPreset: 'org1', origin: POD, road: 'fixed' });
    const sa = wm.e.oauthStatus(a.flowId);
    ok(authSrc.split(ONE).length === 2 && sa.running === true && !b.superseded && (b.flow.listening === false || !!b.flow.refusal), 'RED CONTROL: an engine without the one-pending rule leaves the earlier sign-in running and its held fixed port refuses the new one (port busy) — red on ⑬\'s supersede legs', { aRunning: sa.running, bListening: b.flow.listening, refusal: b.flow.refusal && b.flow.refusal.code });
  } finally { await wm.close(); }
}

// ── ⑭ lane gmail-connect-wall r4 (acceptance r3, THE LAW: after any await a handler draws and keeps nothing unless it is still
// the latest act — and closing the dialog is an act; what a superseded or closed act started on the hub, if it cannot finish
// without this dialog, is ended). THE CLASS, pinned: the REAL Connect dialog (src/lib/channel-account-dialogs.js
// showConnectAccountDialog + src/lib/mounts-dialog.js wireOAuthConnect, bundled by esbuild — only the page edge stubbed at its
// import line: utils' modal / toast / fetchJson, i18n) over a fake page, in front of the REAL engine, routes, store and
// loopback (`world`). A SEEDED scheduler holds every request the dialog sends and every answer it gets, and releases them in
// a random order between random acts — press, the other road, Cancel, close, reopen (only a control a person could press:
// shown and not busy). At rest (everything delivered, the poll ticked twice) THE INVARIANT: what the dialog shows IS what the
// hub runs for the kind — a block with its Cancel ⇔ one sign-in running, the one the block follows; none running ⇔ no such
// block; no listener without a shown sign-in; no sign-in that needs the dialog running behind a closed one; no consent page
// opened after its dialog closed. Two worlds: a silent company Google preset from another computer (the owner's: a loopback
// that needs the dialog's paste box, its other road the fixed address) and a listed one (the route — it comes back by itself;
// its other road a loopback). A failing seed prints its whole sequence. RED: the two r4 guards removed (mutant bundles), and
// the leg itself run on e4cc4acee (the report).
console.log('\n⑭ THE LAW (r4): the live Connect dialog over the real engine — seeded interleavings of press / other road / Cancel / close / reopen');
{
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const net = await import('node:net');
  const { pathToFileURL } = await import('node:url');
  // ── the fake page: what the dialog code touches; isConnected = reachable from the page's root ──
  let ROOT_EL = null;
  const asNode = (n) => (typeof n === 'string' ? Object.assign(new El('#text'), { _text: n }) : n);
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.style = {}; this._text = ''; this._cls = []; this.attrs = {}; this._value = undefined; this.disabled = false; this.hidden = false; this.open = false; this._ls = null; }
    get className() { return this._cls.join(' '); }
    set className(v) { this._cls = String(v).split(/\s+/).filter(Boolean); }
    get classList() { const c = this._cls; return { add: (...a) => { for (const x of a) if (!c.includes(x)) c.push(x); }, remove: (...a) => { for (const x of a) { const i = c.indexOf(x); if (i >= 0) c.splice(i, 1); } }, contains: (x) => c.includes(x), toggle: (x, on) => { const has = c.includes(x); const want = on === undefined ? !has : !!on; if (want && !has) c.push(x); if (!want && has) c.splice(c.indexOf(x), 1); return want; } }; }
    get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
    set textContent(v) { for (const c of this.children) c.parentElement = null; this.children = []; this._text = v == null ? '' : String(v); }
    get innerHTML() { return ''; }
    set innerHTML(v) { this.textContent = ''; }
    get value() { if (this.tagName === 'SELECT' && this._value === undefined) { const o = this.children.find((c) => c.tagName === 'OPTION'); return o ? o.value : ''; } return this._value === undefined ? '' : this._value; }
    set value(v) { this._value = v == null ? '' : String(v); }
    get options() { return this.children.filter((c) => c.tagName === 'OPTION'); }
    get isConnected() { let n = this; while (n.parentElement) n = n.parentElement; return n === ROOT_EL; }
    get offsetParent() { return this.isConnected ? ROOT_EL : null; }
    get parentNode() { return this.parentElement; }
    get firstChild() { return this.children[0] || null; }
    get lastChild() { return this.children[this.children.length - 1] || null; }
    get nextSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
    get nextElementSibling() { return this.nextSibling; }
    get childNodes() { return this.children; }
    get childElementCount() { return this.children.length; }
    _out() { if (this.parentElement) { const s = this.parentElement.children; s.splice(s.indexOf(this), 1); } this.parentElement = null; }
    appendChild(n) { n._out(); n.parentElement = this; this.children.push(n); return n; }
    append(...ns) { for (const n of ns) if (n != null) this.appendChild(asNode(n)); }
    prepend(...ns) { for (const n of ns.reverse()) if (n != null) this.insertBefore(asNode(n), this.children[0] || null); }
    insertBefore(n, ref) { n._out(); n.parentElement = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
    before(...ns) { const p = this.parentElement; if (p) for (const n of ns) if (n != null) p.insertBefore(asNode(n), this); }
    after(...ns) { const p = this.parentElement; if (!p) return; let ref = this.nextSibling; for (const n of ns) { if (n == null) continue; const x = asNode(n); if (x === ref) { ref = x.nextSibling; continue; } p.insertBefore(x, ref); } }
    remove() { this._out(); }
    removeChild(n) { n._out(); return n; }
    replaceChildren(...ns) { this.textContent = ''; this.append(...ns); }
    replaceWith(...ns) { const p = this.parentElement; if (!p) return; for (const n of ns) if (n != null) p.insertBefore(asNode(n), this); this._out(); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    hasAttribute(k) { return k in this.attrs; }
    toggleAttribute(k, on) { if (on === undefined ? !(k in this.attrs) : on) this.attrs[k] = ''; else delete this.attrs[k]; }
    addEventListener(ev, fn) { ((this._ls ||= {})[ev] ||= []).push(fn); }
    removeEventListener(ev, fn) { if (this._ls && this._ls[ev]) this._ls[ev] = this._ls[ev].filter((f) => f !== fn); }
    dispatchEvent(e) { for (const fn of (this._ls && this._ls[e.type]) || []) fn(e); const h = this['on' + e.type]; if (typeof h === 'function') h.call(this, e); return true; }
    click() { if (this.disabled) return undefined; const e = { type: 'click', target: this, preventDefault() {}, stopPropagation() {} }; for (const fn of (this._ls && this._ls.click) || []) fn(e); return typeof this.onclick === 'function' ? this.onclick(e) : undefined; }
    focus() {} blur() {} select() {} scrollIntoView() {} setSelectionRange() {}
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    get all() { const out = []; const st = [...this.children].reverse(); while (st.length) { const n = st.pop(); out.push(n); for (let i = n.children.length - 1; i >= 0; i--) st.push(n.children[i]); } return out; }
    _one(sel) {   // tag?.class.class[attr op "v"]? (:not(...) never matches)
      if (/:not\(/.test(sel)) return false;
      const m = /^([a-z0-9#-]*)((?:\.[\w-]+)*)(?:\[([\w-]+)(?:([*^$]?=)"?([^"\]]*)"?)?\])?$/i.exec(sel);
      if (!m) return false;
      if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
      if (m[2] && !m[2].slice(1).split('.').every((c) => this._cls.includes(c))) return false;
      if (m[3]) { const key = m[3].startsWith('data-') ? null : m[3]; const v = key ? (key === 'id' ? this.id : this.attrs[key]) : this.dataset[m[3].slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase())]; if (v == null) return false; if (m[4] === '=' && String(v) !== m[5]) return false; if (m[4] === '*=' && !String(v).includes(m[5])) return false; if (m[4] === '^=' && !String(v).startsWith(m[5])) return false; }
      return true;
    }
    _match(sel) { const parts = sel.trim().split(/\s+(?![^[]*\])/); if (!this._one(parts[parts.length - 1])) return false; let n = this.parentElement; for (let i = parts.length - 2; i >= 0; i--) { while (n && !n._one(parts[i])) n = n.parentElement; if (!n) return false; n = n.parentElement; } return true; }
    matches(sel) { return String(sel).split(',').some((s) => this._match(s)); }
    closest(sel) { let n = this; while (n) { if (n.matches(sel)) return n; n = n.parentElement; } return null; }
    querySelectorAll(sel) { const s = String(sel).trim(); const sc = /^:scope\s*>\s*(.+)$/.exec(s); if (sc) return this.children.filter((c) => c.matches(sc[1])); return this.all.filter((c) => c.matches(s)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  // ── the page edge the bundle reaches (esbuild `define`: fetch / timers / window.open are THIS page's, never the suite's) ──
  const PAGE_ORIGIN = POD, PAGE_HOST = new URL(POD).hostname;
  const P = globalThis.__cd = { dialogs: [], opens: [], toasts: [], cur: null, actor: null };
  // the virtual clock: the dialog's poll (1.5 s) and its ten-minute end run on it — the driver ticks it at rest
  const clock = { now: 0, seq: 0, timers: new Map() };
  // every timer belongs to the tab that set it (P.actor) — when it fires, that tab acts
  P.setTimeoutAs = (tab, fn, ms = 0, ...a) => { const id = ++clock.seq; clock.timers.set(id, { at: clock.now + Math.max(0, Number(ms) || 0), fn: () => { P.actor = tab; fn(...a); }, every: 0 }); return id; };
  P.setIntervalAs = (tab, fn, ms = 0, ...a) => { const id = ++clock.seq; const every = Math.max(1, Number(ms) || 1); clock.timers.set(id, { at: clock.now + every, fn: () => { P.actor = tab; fn(...a); }, every }); return id; };
  P.clearTimeout = P.clearInterval = (id) => { clock.timers.delete(id); };
  P.raf = (fn) => P.setTimeout(() => fn(clock.now), 0);
  const turn = () => new Promise((r) => setImmediate(r));
  const settle = async () => { for (let i = 0; i < 6; i++) { await turn(); for (const [id, t] of [...clock.timers]) if (!t.every && t.at <= clock.now && clock.timers.has(id)) { clock.timers.delete(id); t.fn(); } } };
  const advance = async (ms) => { const end = clock.now + ms; for (;;) { let nx = null; for (const [id, t] of clock.timers) if (t.at <= end && (!nx || t.at < nx[1].at)) nx = [id, t]; if (!nx) break; const [id, t] = nx; clock.now = t.at; if (t.every) t.at += t.every; else clock.timers.delete(id); t.fn(); await settle(); } clock.now = end; };
  P.t = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
  P.win = { open: (url) => { P.opens.push({ url: String(url), by: P.urlOwner.get(String(url)) || null, n: P.log ? P.log.length : 0 }); return {}; }, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), innerWidth: 1280, innerHeight: 900, location: { origin: PAGE_ORIGIN, hostname: PAGE_HOST, href: PAGE_ORIGIN + '/', protocol: 'https:', host: PAGE_HOST } };
  P.urlOwner = new Map();   // a consent URL → the dialog whose press started it (window.open's `by`)
  P.showToast = (msg) => { P.toasts.push(String(msg)); };
  P.showConfirmDialog = async () => true;
  P.createModalShell = ({ onClose } = {}) => {
    const overlay = new El('div'); overlay.className = 'modal-overlay'; const dialog = new El('div'); dialog.className = 'dialog'; const body = new El('div'); body.className = 'dialog-body'; dialog.append(body); overlay.append(dialog); ROOT_EL.append(overlay);
    let done = false;
    const close = () => { if (done) return; done = true; overlay.remove(); if (typeof onClose === 'function') onClose(); };
    return { body, close, raised: false, overlay, dialog, asked: false, ready: Promise.resolve(null), live: () => !done };
  };
  // the dialog's requests: HELD by the scheduler (a request until released to the real routes, its answer until delivered),
  // each tagged with its TAB (P.actor). A release may FAIL (a rejected fetch, «Failed to fetch»): a press's start (request or
  // answer), the poll's answer, the Cancel button's own cancel — never a close's cancel, a superseded press's end or a kind read
  // (nobody is left to retry those). `P.hubChanges` counts what changed the hub (a start, a cancel that ended something); a
  // tab KNOWS the hub as of the newest answer it was given.
  P.held = []; P.hubChanges = 0; P.tabs = []; P.inAct = null;
  P.fetch = (url, opts = {}) => new Promise((resolve, reject) => {
    const method = (opts && opts.method) || 'GET', body = (opts && opts.body) || null, tab = P.actor, d = P.tabs[tab] ? P.tabs[tab].d : null, u = String(url);
    const kind = /\/oauth\/start$/.test(u) ? 'start' : /\/oauth\/status\?flowId=/.test(u) ? 'poll' : /\/oauth\/status\?kind=/.test(u) ? 'read' : /\/oauth\/cancel$/.test(u) ? 'cancel' : 'other';
    const byButton = kind === 'cancel' && P.inAct === 'cancel' && !!d && d.ctx.body.isConnected;   // the Cancel button's own cancel
    const actsAt = d ? d.acts : 0;   // the dialog's act count when it asked — an answer to an OLDER act's question is not news
    // a CLOSED dialog's sweep (its close reading what its page started) asks in the tab's name after a reopen — never the open
    // dialog's news (the bundle keeps its function names: the sweep's frame is on the stack when it asks)
    const fromSweep = /\bsweep\b/.test(new Error().stack || '');
    const mayFail = kind === 'start' || byButton;
    const tag = `${P.tabs.length > 1 ? 'AB'[tab] || '?' : ''}${method === 'GET' ? 'get' : 'post'} ${u.replace(/^\/api\/channels\/(oauth\/)?/, '').replace(/flowId=([0-9a-f]{6})[0-9a-f]*/, 'flowId=$1').slice(0, 40)}`;
    P.held.push({ tag: `→${tag}`, mayFail, go: async (fail) => {
      if (fail) { P.actor = tab; reject(new TypeError('Failed to fetch')); return; }
      const res = await fetch(P.base + url, { method, body, headers: { 'Content-Type': 'application/json', Origin: PAGE_ORIGIN } });
      const txt = await res.text();
      let j = {}; try { j = JSON.parse(txt || '{}'); } catch { j = {}; }
      if (kind === 'start' && j && j.flowId) { P.seen.add(j.flowId); P.hubChanges++; if (j.url) P.urlOwner.set(String(j.url), d); }
      if (kind === 'cancel' && j && j.cancelled) P.hubChanges++;
      const seenAt = P.hubChanges;
      const said = j && (j.error ? `!${String(j.code || j.error).slice(0, 18)}` : j.flowId && kind === 'start' ? `=${String(j.flowId).slice(0, 6)}` : 'running' in j ? (j.running ? '=run' : `=${j.done ? 'done' : 'stopped'}${j.flow && j.flow.cancelled ? '/' + j.flow.cancelled : ''}`) : 'cancelled' in j ? `=${j.cancelled}` : '');
      // an answer fails only on its way to an OPEN dialog (a closed one never hears it either way — the hub's own end takes it)
      P.held.push({ tag: `←${tag}${said}`, get mayFail() { return (mayFail || kind === 'poll') && !!d && d.ctx.body.isConnected; }, go: async (fail2) => {
        P.actor = tab;
        if (fail2) { reject(new TypeError('Failed to fetch')); return; }
        // what the hub RUNS, as of its answer, is known to the DIALOG that asked (a read, the poll, a start, its Cancel button's own
        // cancel — «yours ended» / «yours was not running» is news of the hub too) — never to a sibling
        // (only while no newer act of that dialog came since it asked: the answer to a superseded question is rightly dropped)
        if ((kind === 'read' || kind === 'poll' || kind === 'start' || byButton) && d && d.acts === actsAt) { if (!fromSweep) d.knows = Math.max(d.knows || 0, seenAt); else d.sweptAs = Math.max(d.sweptAs || 0, seenAt); }   // sweptAs: what a closed dialog's sweep answered in this dialog's name (the replay shows it)
        resolve({ ok: res.ok, status: res.status, json: async () => j, text: async () => txt });
      } });
    } });
  });
  P.fetchAs = (tab, url, opts) => { P.actor = tab; return P.fetch(url, opts); };   // the shim's: the tab is its module instance's
  P.fetchJson = async (url, opts = {}) => { try { const r = await fetch(P.base + url, { ...opts, headers: { 'Content-Type': 'application/json', Origin: PAGE_ORIGIN } }); return await r.json(); } catch (e) { return { error: String(e.message || e) }; } };
  // ── the bundle: the dialog modules as they ship; utils / i18n / build-version stubbed at their import line ──
  const lib = path.join(REPO, 'src/lib');
  const namesOf = (src) => { const out = new Set(); for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) out.add(m[1]); for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]); for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const n of m[1].split(',')) { const x = n.trim().split(/\s+as\s+/).pop(); if (x) out.add(x); } return [...out]; };
  const HOOK = { 'utils.js': ['fetchJson', 'showToast', 'showConfirmDialog', 'createModalShell'], 'i18n.js': ['t', 'tc'] };
  const stubOf = (file) => {
    const base = path.basename(file);
    if (base === 'build-version.js') return 'export const BUILD_VERSION = "test";';
    const names = namesOf(fs.readFileSync(file, 'utf8'));
    return names.map((n) => (base === 'i18n.js' && (n === 't' || n === 'tc') ? `export const ${n} = (a, b, c) => globalThis.__cd.t(${n === 'tc' ? 'b, c' : 'a, b'});`
      : HOOK[base] && HOOK[base].includes(n) ? `export const ${n} = (...a) => globalThis.__cd.${n}(...a);`
        : /^[A-Z][A-Z0-9_]*$/.test(n) ? `export const ${n} = undefined;` : `export const ${n} = () => undefined;`)).join('\n');
  };
  const bundle = async (tag, mutate = null) => {
    const plug = { name: 'page-edge', setup(b) {
      b.onResolve({ filter: /^\.\/(utils|i18n|build-version)\.js$/ }, (a) => (a.importer.startsWith(lib + path.sep) ? { path: path.join(lib, a.path.slice(2)), namespace: 'edge' } : undefined));
      b.onLoad({ filter: /.*/, namespace: 'edge' }, (a) => ({ contents: stubOf(a.path), loader: 'js' }));
      if (mutate) b.onLoad({ filter: /src[\\/]lib[\\/]mounts-dialog\.js$/ }, (a) => ({ contents: mutate(fs.readFileSync(a.path, 'utf8')), loader: 'js' }));
    } };
    const out = path.join(ROOT, `dialog-${tag}.mjs`);
    // the page edge is INJECTED (esbuild `inject`): fetch / timers / window / location are this page's, and each import of the
    // bundle (`?tab=N`) is its own module instance — its own TAB, read off import.meta.url, on every request and timer it makes
    const shim = path.join(ROOT, 'page-edge-shim.mjs');
    if (!fs.existsSync(shim)) fs.writeFileSync(shim, [
      "const TAB = (() => { try { return Number(new URL(import.meta.url).searchParams.get('tab') || 0); } catch { return 0; } })();",
      'const P = () => globalThis.__cd;',
      'export const fetch = (u, o) => P().fetchAs(TAB, u, o);',
      'export const setTimeout = (f, ms, ...a) => P().setTimeoutAs(TAB, f, ms, ...a);',
      'export const setInterval = (f, ms, ...a) => P().setIntervalAs(TAB, f, ms, ...a);',
      'export const clearTimeout = (id) => P().clearTimeout(id);',
      'export const clearInterval = (id) => P().clearInterval(id);',
      'export const requestAnimationFrame = (f) => P().setTimeoutAs(TAB, () => f(0), 0);',
      'export const window = new Proxy({}, { get: (_, k) => P().win[k] });',
      'export const location = new Proxy({}, { get: (_, k) => P().win.location[k] });',
    ].join('\n'));
    await esbuild.build({ stdin: { contents: `export { showConnectAccountDialog } from ${JSON.stringify(path.join(lib, 'channel-account-dialogs.js'))};\nexport { reauthDialog } from ${JSON.stringify(path.join(lib, 'mounts-dialog.js'))};`, resolveDir: lib, loader: 'js' }, bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], outfile: out, plugins: [plug], logLevel: 'silent', legalComments: 'none', inject: [shim] });
    return [await import(pathToFileURL(out).href + `?tab=0&v=${tag}`), await import(pathToFileURL(out).href + `?tab=1&v=${tag}`)];
  };
  // the page globals the bundle reads bare (set for this section only; the suite's own code is done with the DOM-free part)
  ROOT_EL = new El('html');
  globalThis.document = { createElement: (t) => new El(t), createElementNS: (ns, t) => new El(t), createTextNode: (s) => asNode(String(s)), createDocumentFragment: () => new El('#fragment'), body: ROOT_EL, documentElement: ROOT_EL, addEventListener() {}, removeEventListener() {}, querySelector: (s) => ROOT_EL.querySelector(s), querySelectorAll: (s) => ROOT_EL.querySelectorAll(s), getElementById: () => null, activeElement: null, hidden: false };
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.sessionStorage = globalThis.sessionStorage || globalThis.localStorage;
  globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
  globalThis.Event = globalThis.Event || class { constructor(type) { this.type = type; } };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  let D = null;
  try { D = await bundle('real'); } catch (e) { ok(false, '⑭ the Connect dialog bundles (esbuild, the page edge stubbed)', String((e && e.errors && e.errors.map((x) => x.text).join(' | ')) || (e && e.message) || e)); }
  if (D) {
    // ── one seed: the world's hub, one dialog open; random acts and releases; then the invariant at rest ──
    const rngOf = (seed) => { let x = (seed * 2654435761) >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
    const pickOf = (rnd, a) => a[Math.floor(rnd() * a.length)];
    // the Gmail type's consent block: the wrap wireOAuthConnect put right before its token field (`flow.gmail`)
    const blockOf = (d) => { if (!d || !d.ctx.body.isConnected) return null; const tok = d.ctx.inputs && d.ctx.inputs['flow.gmail']; const par = tok && tok.parentElement; const wrap = par ? par.children[par.children.indexOf(tok) - 1] : null; if (!wrap || !wrap._cls.includes('mounts-drive-connect')) return null; const st = wrap.children.find((c) => c._cls.includes('mounts-field-hint')); return { wrap, btn: wrap.querySelector('button.mounts-btn-primary'), other: wrap.querySelector('.mounts-oauth-other'), cancel: wrap.querySelector('.mounts-oauth-cancel'), status: st ? st.textContent : '' }; };
    // a listener THIS process holds on the port (Linux: its socket inodes in /proc/self/fd, LISTEN rows of /proc/net/tcp[6]) — a TCP
    // connect alone also answers for ANOTHER process that took the recycled port on a busy box (sweep 3's one red, base 271828);
    // where /proc cannot be read, the connect is the witness
    const ownListenPorts = () => { try { const ino = new Set(); for (const f of fs.readdirSync('/proc/self/fd')) { try { const m = /^socket:\[(\d+)\]$/.exec(fs.readlinkSync(`/proc/self/fd/${f}`)); if (m) ino.add(m[1]); } catch { /* closed meanwhile */ } } const ports = new Set(); for (const t of ['/proc/net/tcp', '/proc/net/tcp6']) { let txt = ''; try { txt = fs.readFileSync(t, 'utf8'); } catch { continue; } for (const line of txt.split('\n').slice(1)) { const c = line.trim().split(/\s+/); if (c.length > 9 && c[3] === '0A' && ino.has(c[9])) ports.add(parseInt(c[1].split(':')[1], 16)); } } return ports; } catch { return null; } };
    const listens = async (port, own = ownListenPorts()) => { if (!port) return false; if (own) return own.has(port); return new Promise((r) => { const s = net.connect({ port, host: '127.0.0.1' }, () => { s.destroy(); r(true); }); s.on('error', () => r(false)); }); };
    // the dialog on the Gmail type alone (the other types' blocks would only add their own status reads to the interleavings), in
    // TAB `t` (a seed may open two: the second client — another browser tab on the same hub)
    // the record exists BEFORE the dialog opens: its attach asks while showConnectAccountDialog is still being awaited
    const openDialog = async (kinds, t) => { P.actor = t; const d = { no: ++P.dno, tab: t, ctx: { body: { isConnected: false } }, closedAt: null, knows: 0, acts: 0 }; P.tabs[t].d = d; P.dialogs.push(d); d.ctx = await D[t].showConnectAccountDialog({}, kinds.filter((k) => k.kind === 'gmail'), { kind: 'gmail' }); await settle(); return d; };
    const W = { press: 3, cancel: 3, other: 2, close: 1, reopen: 1, tick: 1 };
    const FULL = { tabs: 0.35, fail: 0.2, tick: true }, PLAIN = { tabs: 0, fail: 0, tick: false };
    // `script` (a named leg): {tabs, steps: [[op, tab|tag, fail?]…]} — the steps instead of the seed's choices (op: press / other /
    // cancel / close / reopen / tick, or ['rel', <a tag fragment>, fail] = release the first held item whose tag holds it)
    const runSeed = async (w, kinds, seed, cfg = FULL, script = null) => {
      const rnd = rngOf(seed); const log = []; P.log = log;
      P.dialogs = []; P.dno = 0; P.opens = []; P.toasts = []; P.held = []; P.seen = new Set(); P.urlOwner = new Map(); P.hubChanges = 0; clock.timers.clear();
      const nTabs = script ? script.tabs : (rnd() < cfg.tabs ? 2 : 1);
      P.tabs = Array.from({ length: nTabs }, () => ({ d: null }));
      for (let t = 0; t < nTabs; t++) await openDialog(kinds, t);
      let acts = 4 + Math.floor(rnd() * 6) + (nTabs - 1) * 3;
      const actOdds = 0.3 + rnd() * 0.5;   // each seed its own temper: some act in bursts (Cancel then a press at once), some wait
      const failOdds = rnd() < (cfg.failSeeds == null ? 0.5 : cfg.failSeeds) ? cfg.fail : 0;   // half the seeds (by default) meet a network failure now and then
      for (let step = 0; step < 60; step++) {
        if (script) {
          const st = script.steps.shift(); if (!st) break;
          const [op, a1, a2] = st;
          if (op === 'rel') { const i = P.held.findIndex((h) => h.tag.includes(a1)); if (i < 0) log.push(`(nothing held «${a1}»)`); else { const h = P.held.splice(i, 1)[0]; log.push(h.tag + (a2 ? ' ✗net' : '')); await h.go(!!a2); } }
          else if (op === 'tick') { log.push('TICK'); await advance(1600); }
          else {
            const t = a1 || 0, d = P.tabs[t].d, b = blockOf(d);
            log.push(`${nTabs > 1 ? 'AB'[t] : ''}${op.toUpperCase()}`);
            P.actor = t; P.inAct = op; if (op !== 'reopen') d.acts++;
            if (op === 'press' && b) b.btn.click(); else if (op === 'cancel' && b && b.cancel) b.cancel.click(); else if (op === 'other' && b && b.other) b.other.click(); else if (op === 'close') { d.closedAt = log.length; d.ctx.close(); }
            P.inAct = null;
            if (op === 'reopen') await openDialog(kinds, t);
          }
          await settle(); continue;
        }
        const can = [];
        if (acts > 0) {
          for (let t = 0; t < nTabs; t++) {
            const d = P.tabs[t].d, b = blockOf(d);
            if (b && b.btn && !b.btn.disabled) can.push([t, 'press']);
            if (b && b.other && !b.other.disabled) can.push([t, 'other']);
            if (b && b.cancel && !b.cancel.disabled) can.push([t, 'cancel']);
            can.push([t, d.ctx.body.isConnected ? 'close' : 'reopen']);
          }
          if (cfg.tick) can.push([null, 'tick']);   // the poll ticks DURING the walk (virtual time moves 1.6 s)
        }
        if (!can.length && !P.held.length) break;
        // weighted acts: a press, Cancel and the other road are what race; a close / reopen ends the story, so rarer
        const weighted = (arr) => { let tot = 0; for (const x of arr) tot += W[x[1]]; let r = rnd() * tot; for (const x of arr) { r -= W[x[1]]; if (r < 0) return x; } return arr[arr.length - 1]; };
        // a release: the NEWEST held item half the time (a later request or answer overtaking an earlier one is the race), else any
        if (can.length && (!P.held.length || rnd() < actOdds)) {
          const [t, a] = weighted(can); acts--;
          log.push(`${t != null && nTabs > 1 ? 'AB'[t] : ''}${a.toUpperCase()}`);
          if (a === 'tick') await advance(1600);
          else {
            const d = P.tabs[t].d, b = blockOf(d);
            P.actor = t; P.inAct = a; d.acts++;
            if (a === 'press') b.btn.click();
            else if (a === 'other') b.other.click();
            else if (a === 'cancel') b.cancel.click();
            else if (a === 'close') { d.closedAt = log.length; d.ctx.close(); }   // closedAt: the log position (opens after it are late)
            P.inAct = null;
            if (a === 'reopen') await openDialog(kinds, t);
          }
        } else {
          const h = P.held.splice(rnd() < 0.5 ? P.held.length - 1 : Math.floor(rnd() * P.held.length), 1)[0];
          const fail = !!h.mayFail && rnd() < failOdds;
          log.push(h.tag + (fail ? ' ✗net' : ''));
          await h.go(fail);
        }
        await settle();
      }
      // AT REST: everything delivered (no failure now), the poll ticked twice
      const drain = async () => { for (let g = 0; g < 300 && P.held.length; g++) { const h = P.held.splice(rnd() < 0.5 ? P.held.length - 1 : Math.floor(rnd() * P.held.length), 1)[0]; log.push(h.tag); await h.go(false); await settle(); } };
      await drain();
      for (let k = 0; k < 2; k++) { await advance(1600); await drain(); }
      // THE INVARIANT at rest
      const ids = [...P.seen];
      const stOf = (id) => { try { return w.e.oauthStatus(id); } catch { return null; } };   // the engine's own record (the route's)
      const running = ids.filter((id) => (stOf(id) || {}).running);
      const R = running.length === 1 ? running[0] : null;
      const portOf = (id) => ((stOf(id) || {}).flow || {}).port || null;
      const own = ownListenPorts();   // once per seed
      const live = []; for (const p of [...new Set(ids.map(portOf).filter(Boolean))]) if (await listens(p, own)) live.push(p);
      const why = [];
      if (running.length > 1) why.push(`${running.length} sign-ins of the kind run`);
      const open = P.tabs.map((tb) => tb.d).filter((d) => d.ctx.body.isConnected);
      const shownBy = [];
      for (const d of open) {
        const b = blockOf(d), shows = !!(b && b.cancel), who = nTabs > 1 ? `tab ${'AB'[d.tab]}: ` : '';
        if (shows && (!R || b.wrap.dataset.flow !== R)) why.push(`${who}the dialog shows a sign-in (its Cancel) the hub does not run`);
        if (shows && R && b.wrap.dataset.flow === R) shownBy.push(d);
        // a tab TOLD of the hub after its last change (its newest answer) shows what runs — «cancelled» is said only when nothing does
        if (!shows && R && d.knows >= P.hubChanges) why.push(`${who}the hub runs a sign-in the dialog was told of and does not show («${b ? b.status.slice(0, 40) : 'no block'}»)`);
        if (b && ((b.btn && b.btn.disabled) || (b.other && b.other.disabled) || (b.cancel && b.cancel.disabled))) why.push(`${who}a control is still busy at rest`);
      }
      if (R && !shownBy.length && ((stOf(R) || {}).flow || {}).mode !== 'public') why.push(open.length ? 'a sign-in that needs the dialog runs with no open dialog showing it' : 'a sign-in that needs the dialog runs behind a closed one');
      if (live.some((p) => p !== portOf(R))) why.push('a listener runs without its sign-in running');
      if (live.length && !shownBy.length) why.push(open.length ? 'a listener runs with no sign-in shown' : 'a listener runs behind a closed dialog');
      if (P.opens.some((o) => o.by && o.by.closedAt != null && o.n >= o.by.closedAt)) why.push('a consent page opened after its dialog closed');
      const rest = { running, hubChanges: P.hubChanges, tabs: P.tabs.map((tb) => { const b = blockOf(tb.d); return { open: tb.d.ctx.body.isConnected, knows: tb.d.knows, sweptAs: tb.d.sweptAs || 0, flow: b ? b.wrap.dataset.flow || null : null, cancel: !!(b && b.cancel), status: b ? b.status.slice(0, 120) : null }; }) };
      // clean: every dialog closed, every sign-in of the seed ended, nothing held
      for (const x of P.dialogs) x.ctx.close();
      await drain();
      for (const id of ids) { try { w.e.oauthCancel(id); } catch { /* ended */ } }
      return { ok: !why.length, why, log, nTabs, rest };
    };
    const SILENT14 = { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1' };
    const LISTED14 = { ...SILENT14, instanceAddress: 'listed' };
    const worlds = [];
    for (const [name, drive, nd] of [['silent preset · a loopback that needs the dialog', SILENT14, true], ['listed preset · the route (comes back by itself)', LISTED14, false]]) {
      const w = await world(`ilv-${worlds.length}`, { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive, larkPreset: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark' } });
      P.base = w.origin; RT.setup({ getEngine: () => w.e });
      const dg = await (await fetch(`${w.origin}/api/channels?scope=accounts`, { headers: { Origin: PAGE_ORIGIN } })).json();
      worlds.push({ name, w, kinds: (dg && dg.kinds) || [], nd, drive, gen: 0 });
    }
    // a FRESH hub every 100 seeds: one hub over thousands of seeds keeps every ended sign-in it ever had (each start scans them —
    // the sweep went quadratic); a new world of the same shape keeps a seed's cost flat
    const fresh = async (wo) => { try { await wo.w.close(); } catch { /* gone */ } wo.w = await world(`ilv-${worlds.indexOf(wo)}-${++wo.gen}`, { serverSetting: NO_RELAY, fixedPath: 'gmail/cb', drive: wo.drive, larkPreset: { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark' } }); P.base = wo.w.origin; RT.setup({ getEngine: () => wo.w.e }); };
    // CR_SEEDS = seeds per world (default 100 — the fast tier's time), CR_SEED0 = an offset (another reader's own seeds)
    const SEEDS = Number(process.env.CR_SEEDS || 100), SEED0 = Number(process.env.CR_SEED0 || 0);
    // the routes module holds ONE engine (RT.setup) — a world in use is the one the routes ask
    const useWorld = (wo) => { P.base = wo.w.origin; RT.setup({ getEngine: () => wo.w.e }); };
    try {
      ok(worlds.every((x) => x.kinds.some((k) => k.kind === 'gmail')), '⑭ the digest names the Gmail type with its company preset (the dialog\'s own types)', worlds.map((x) => x.kinds.map((k) => k.kind)));
      const runOne = async (wo) => { useWorld(wo); return runSeed(wo.w, wo.kinds, 1); };
      if (process.env.CR_SEED_ONLY) {   // a reader's replay: CR_SEED_ONLY=<seed> [CR_WORLD=0|1] — the whole sequence and the state at rest
        const wo = worlds[Number(process.env.CR_WORLD || 0)]; useWorld(wo);
        const r = await runSeed(wo.w, wo.kinds, Number(process.env.CR_SEED_ONLY));
        console.log(`      replay [${wo.name}] seed ${process.env.CR_SEED_ONLY} (${r.nTabs} tab(s)): ${r.ok ? 'holds' : r.why.join('; ')}\n      ${r.log.join(' ')}\n      at rest: ${JSON.stringify(r.rest)}`);
      }
      const first = await runOne(worlds[0]);
      ok(first.log.length > 0, '⑭ the driver drives the dialog (a seed acts, its requests and answers are released)', first.log.join(' '));
      // every control's bundle builds WHILE the law walks (esbuild works in its own process) — the fast tier's time
      const muts = MUTS();
      const mutBuilt = muts.map(([, , edits], i) => bundle(`mut${i}`, (x) => edits.reduce((acc, [from, to]) => acc.replace(from, to), x)));
      const RB_FROM = "      if (live) busy(false);   // r4 (the tidy): every exit of a press ends its busy for every control it took (the other road too)\n";
      const rbBuilt = bundle('mut-rb', (x) => x.replace(RB_FROM, ''));
      mutBuilt.forEach((pr) => pr.catch(() => {})); rbBuilt.catch(() => {});
      const bad = [], tLaw = Date.now();
      for (const wo of worlds) { useWorld(wo); for (let s = 1; s <= SEEDS; s++) { if (s % 100 === 0) await fresh(wo); const seed = SEED0 + s * 7919 + worlds.indexOf(wo); const r = await runSeed(wo.w, wo.kinds, seed); if (!r.ok) bad.push({ world: wo.name, seed, why: r.why, seq: r.log.join(' ') }); } }
      // a red run names every shape it found (how many seeds each), then the first seed of each with its whole sequence
      const shapes = new Map(); for (const x of bad) for (const y of x.why) { const k = y.replace(/«([^»]{0,26})[^»]*»/, '«$1…»').replace(/runs \d+$/, 'runs N'); if (!shapes.has(k)) shapes.set(k, { n: 0, first: x }); shapes.get(k).n++; }
      ok(!bad.length, `⑭ THE LAW over ${SEEDS} seeds × ${worlds.length} worlds (press / other road / Cancel / close / reopen, every request and answer held and reordered): at rest the dialog shows exactly what the hub runs — a block with its Cancel ⇔ the one sign-in running; no listener without a shown sign-in; nothing that needs the dialog behind a closed one; no consent page after the close`, `${bad.length} of ${SEEDS * worlds.length} seeds — ${[...shapes].map(([k, v]) => `${v.n}× ${k}`).join(' · ')}`);
      // (ok() cuts its detail) every shape on its own lines: how many seeds, the first one's whole sequence
      console.log(`      (the law: ${SEEDS * worlds.length} seeds in ${Date.now() - tLaw} ms)`);
      // every red seed with its replay line (a reader re-runs exactly it)
      for (const x of bad) console.log(`      red: CR_SEED_ONLY=${x.seed} CR_WORLD=${worlds.findIndex((w) => w.name === x.world)} — ${x.why.join('; ')}`);
      if (bad.length) for (const [k, v] of shapes) console.log(`      ${v.n}× ${k}\n        first: [${v.first.world}] seed ${v.first.seed}: ${v.first.seq}`);
      // RED CONTROLS: each r4 guard removed (a mutant bundle) — the same driver finds it by itself
      // each mutant = [from, to] edits of the tip's mounts-dialog.js; EVERY `from` must be there exactly once (a moved anchor is red
      // here, never a control that silently mutates less)
      function MUTS() { return [
        // instance 1 as round 3 had it: Cancel's tail draws «cancelled» with no latest-act check and no hub read, the presses free
        ['Cancel draws «cancelled» over a newer act (round 3\'s Cancel: no latest-act check, no hub read, the presses not busy)', PLAIN, [
          ["        if (mine !== gen || closed) return;   // r4 (THE LAW): a newer act draws its own state — «cancelled» is never said over it\n", ''], ["        const mine = ++gen; stopPoll(); busy(true);\n        // r4: a Cancel whose own request failed", "        const mine = ++gen; stopPoll();\n        // r4: a Cancel whose own request failed"], ["        await adoptOrEnd(mine, prov, ours ? tr('The sign-in was cancelled.') : tr('The sign-in this dialog showed had already ended.'), tr('The sign-in was cancelled. Press the button to start again.'));", "        ended(tr('The sign-in was cancelled. Press the button to start again.'));"]]],
        // instance 2 as round 3 had it: no close hook
        ['a close is not an act (no close hook: a press in flight at the close draws on the closed block, opens its page, keeps its sign-in)', PLAIN, [
          ["  return { close: () => { if (closed) return; closed = true; ++gen; stopPoll(); sweepLater(); } };", "  return { close: () => {} };"]]],
        // the tidy's item 3: Cancel says «cancelled» without reading what the hub runs (two tabs find it)
        ['Cancel says «cancelled» without reading what the hub runs (a sign-in another tab started stays unshown)', { ...PLAIN, tabs: 1 }, [
          ["        await adoptOrEnd(mine, prov, ours ? tr('The sign-in was cancelled.') : tr('The sign-in this dialog showed had already ended.'), tr('The sign-in was cancelled. Press the button to start again.'));", "        ended(tr('The sign-in was cancelled. Press the button to start again.'));"]]],
        // the tidy's item 2 (the Connect half): a failed Cancel leaves the presses busy
        ['a Cancel whose own request failed leaves the presses busy (no busy(false) on its failure)', { ...FULL, tabs: 0, fail: 0.6, failSeeds: 1 }, [
          ["if (mine === gen && !closed) { busy(false); watchShown(prov); } throw e; }", "if (mine === gen && !closed) { watchShown(prov); } throw e; }"]]],
      ]; }
      for (const [i, [what, ccfg, edits]] of (process.env.CR_LAW_ONLY ? [] : muts.entries())) {   // CR_LAW_ONLY=1: a seed sweep, the law alone
        const t0 = Date.now();
        const src = fs.readFileSync(path.join(REPO, 'src/lib/mounts-dialog.js'), 'utf8');
        const changed = edits.every(([from]) => src.split(from).length === 2);
        const Dm = await mutBuilt[i];
        const keep = D; D = Dm;
        const found = [];
        // the control stops at its first find (up to three times the law's seeds — a guard's race can be rarer than the class)
        let tried = 0;
        for (let s = 1; s <= SEEDS * 3 && !found.length; s++) for (const wo of worlds) { if (found.length) break; if (s % 100 === 0) await fresh(wo); useWorld(wo); tried++; const seed = SEED0 + s * 7919 + worlds.indexOf(wo); const r = await runSeed(wo.w, wo.kinds, seed, ccfg); if (!r.ok) found.push({ world: wo.name, seed, why: r.why }); }
        D = keep;
        ok(changed && found.length > 0, `⑭ RED CONTROL: ${what} — the seeded driver finds it by itself`, found.length ? `found after ${tried} seeds: [${found[0].world}] seed ${found[0].seed}: ${found[0].why.join('; ')}` : `not found in ${tried} seeds`);
        if (found.length) console.log(`      (found after ${tried} seeds in ${Date.now() - t0} ms: [${found[0].world}] seed ${found[0].seed} — ${found[0].why.join('; ')})`);
      }
      // ⑭d THE CLOSE ENDS WHAT THIS PAGE STARTED (主开发's base 104729, seed 1443040): a press whose start answer never came, a
      // Cancel that made the read of what runs moot, a close → reopen → close — the sign-in the second press started (its id never
      // seen) ran on behind the closed dialog with its listener. Now every close (and a press failing after it) reads the kind
      // and ends what runs if THIS PAGE started it (its `ref`) and it needs the dialog. Named: the seed, the class as a script,
      // and its guard — another tab's sign-in is never ended by this page's close.
      useWorld(worlds[0]);
      const s1443 = await runSeed(worlds[0].w, worlds[0].kinds, 1443040);
      ok(s1443.ok, '⑭d the seed 1443040 (主开发\'s base 104729, the loopback world) holds: nothing that needs the dialog runs behind it', s1443.ok ? undefined : `${s1443.why.join('; ')}\n      ${s1443.log.join(' ')}`);
      const lost = await runSeed(worlds[0].w, worlds[0].kinds, 1, FULL, { tabs: 1, steps: [['press'], ['rel', '→get status?kind'], ['rel', '→post start'], ['rel', '←post start'], ['press'], ['rel', '→post start'], ['rel', '←get status?kind'], ['rel', '←post start', true], ['cancel'], ['rel', '→get status?kind'], ['rel', '←get status?kind'], ['close'], ['reopen'], ['close']] });
      ok(lost.ok && lost.rest.running.length === 0, '⑭d the class as a script: a second press whose start answer is LOST (the hub ran it), a Cancel, close → reopen → close — the close ends the sign-in this page started though it never learned its id (nothing runs, no listener)', lost.ok && !lost.rest.running.length ? undefined : `${lost.why.join('; ')} running=${lost.rest.running.length}\n      ${lost.log.join(' ')}`);
      const other = await runSeed(worlds[0].w, worlds[0].kinds, 1, FULL, { tabs: 2, steps: [['press', 1], ['rel', '→Bpost start'], ['rel', '←Bpost start'], ['press', 0], ['rel', '→Apost start', true], ['close', 0]] });
      ok(other.ok && other.rest.running.length === 1 && other.rest.tabs[1].flow === other.rest.running[0], '⑭d its guard: tab A\'s close (its own press refused on the way) reads the kind and leaves tab B\'s sign-in alone — another page\'s `ref`', other.ok ? JSON.stringify(other.rest) : `${other.why.join('; ')}\n      ${other.log.join(' ')}`);
      // ⑭c the tidy's item 4 (the REAL routes): a cancel that names its sign-in names it by a string — a number, an object or an
      // empty string is refused by name (400 bad-flow), never read as «none named»; an absent flowId keeps the old client's meaning
      useWorld(worlds[0]);
      const cancelAs = async (b) => { const r = await fetch(`${worlds[0].w.origin}/api/channels/adapters/no-such-account/auth/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: PAGE_ORIGIN }, body: JSON.stringify(b) }); let j = {}; try { j = await r.json(); } catch { j = {}; } return { status: r.status, code: j.code || null }; };
      const c4 = { num: await cancelAs({ flowId: 12345 }), obj: await cancelAs({ flowId: { id: 'x' } }), empty: await cancelAs({ flowId: '' }), none: await cancelAs({}), nul: await cancelAs({ flowId: null }), named: await cancelAs({ flowId: 'abc' }) };
      ok(['num', 'obj', 'empty'].every((k) => c4[k].status === 400 && c4[k].code === 'bad-flow') && ['none', 'nul', 'named'].every((k) => c4[k].status !== 400),
        '⑭c the account cancel route: a flowId that is not a non-empty string is refused by name (400 bad-flow); absent / null keeps the old meaning (the engine is asked — here an unknown account)', c4);
      // ⑭b THE RE-AUTHORIZE HALF of «a busy control always comes back» (the tidy's item 2): the REAL reauthDialog (live), its
      // start / cancel faked — every exit of a press, the other road or Cancel (an answer, an {error} answer, a rejected fetch)
      // ends its busy state for EVERY control it took: the button and the shown sign-in's other road usable again
      const reauthBusy = async (Dx) => {
        const bad = []; let n = 0, mode = 'ok';
        const flow = (id) => ({ flowId: id, url: `https://consent.example.test/o?f=${id}`, live: true, pasteTitle: 'paste', pasteOpen: true, roadLine: 'the road', otherRoad: { label: 'Another road', hint: 'why', run: () => start() } });
        const start = async () => { if (mode === 'reject') throw new TypeError('Failed to fetch'); if (mode === 'error') return { error: 'the hub said no (a test answer)' }; return flow(`F${++n}`); };
        P.actor = 0;
        const d = Dx[0].reauthDialog({ title: 'Re-authorize', hint: 'h', signinLabel: 'Sign in with Google', provider: 'Google', live: true, start: () => start(), status: async () => ({}),
          cancel: async () => { if (mode === 'cancelfail') throw new TypeError('Failed to fetch'); return { ok: true, cancelled: true }; }, callback: async () => ({ token: 't' }), finish: async () => {} });
        const els = () => ({ btn: d.button, other: d.body.querySelector('.mounts-oauth-other'), cancel: d.body.querySelector('.mounts-oauth-cancel') });
        const usable = (why) => { const e = els(); const busy = [e.btn && e.btn.disabled ? 'the button' : null, e.other && e.other.disabled ? 'the other road' : null].filter(Boolean); if (busy.length) bad.push(`${why}: ${busy.join(' + ')} still busy`); };
        d.button.click(); await settle();
        if (!els().other) bad.push('the press drew no block with its other road');
        for (const m of ['reject', 'error']) { mode = m; d.button.click(); await settle(); usable(`a failed press (${m === 'reject' ? 'a rejected fetch' : 'an {error} answer'})`); }
        mode = 'reject'; if (els().other) { els().other.click(); await settle(); usable('a failed other road'); }
        mode = 'cancelfail'; if (els().cancel) { els().cancel.click(); await settle(); usable('a failed Cancel'); }
        mode = 'ok'; d.close(); await settle(); clock.timers.clear();
        return bad;
      };
      const rb = await reauthBusy(D);
      ok(!rb.length, '⑭b the Re-authorize dialog (live): every failed exit — a press answered {error}, a rejected fetch, a failed other road, a failed Cancel — gives the button AND the other road back', rb);
      const reauthSrc = fs.readFileSync(path.join(REPO, 'src/lib/mounts-dialog.js'), 'utf8');
      const Drb = await rbBuilt;
      const rbm = await reauthBusy(Drb);
      ok(reauthSrc.split(RB_FROM).length === 2 && rbm.length > 0, '⑭b RED CONTROL: without busy(false) on a failed press the other road stays busy — e4cc4acee\'s reauth gave it back, c6be196d2\'s did not (the tidy\'s item 2)', rbm);
    } finally { for (const x of worlds) await x.w.close(); }
  }
}

await new Promise((r) => vendor.close(r));   // lane gmail-connect-wall: ⑬'s exchanges ride the fake too — closed last
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
