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
//      pod's Lark (VIBESPACE_OAUTH_RELAY_URL; the admin copy's data-allow = the fleet's domain) and a local hub's Gmail and
//      Lark (the public page, data-allow empty) — redirect_uri = the relay page, the page sends the browser to
//      <u>/api/channels/oauth/cb/<kind> with the vendor's query VERBATIM, the landing says connected, the fake vendor saw
//      the exchange with the relay page as its redirect; a preset's own relay page (Lark JSON entry, a Google drive
//      preset); the kinds digest's `relayPages` (the addresses an app registers ONCE)
//   ⑥ + RED CONTROL = 2c22424d (the relay never asked: a pod registers one address per pod) — red on ⑦'s fleet leg; a
//      verdict that takes any configured relay ⇒ a pod rides the public page, which only shows the code — red on ①
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
  // the page
  const okPage = CR.landingHtml({ ok: true, user: '<b>Ada</b>' }, { name: 'Lark' });
  const deny = CR.landingHtml({ ok: false, why: 'denied' }, { name: 'Lark' });
  const used = CR.landingHtml({ ok: false, why: 'used' }, { name: 'Google' });
  ok(/data-landing="ok"/.test(okPage) && okPage.includes(`<script>${CR.CLOSE_SCRIPT}</script>`) && (okPage.match(/<p lang=/g) || []).length === 3 && okPage.includes('&lt;b&gt;Ada&lt;/b&gt;') && !okPage.includes('<b>Ada'),
    'a connected page: three languages, the person escaped, the close script (and only it)');
  ok(/data-landing="denied"/.test(deny) && !/<script/.test(deny) && /data-landing="failed"/.test(used) && /already used/.test(used) && /Google/.test(used) && !/<script/.test(used), 'a declined / a used sign-in says so and closes nothing');
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
async function world(tag, { publicUrl = POD, larkPreset = { appId: 'cli_road0001', appSecret: 'dummy-road-secret-01', brand: 'lark' }, env = {}, serverSetting = () => undefined, drive = { key: 'org1', label: 'Org 1', clientId: '123-road.apps.googleusercontent.com', clientSecret: 'dummy-road-gsecret-1' } } = {}) {
  const dir = path.join(ROOT, tag);
  fs.mkdirSync(dir, { recursive: true });
  const integrations = STORE.create({ dataDir: path.join(dir, 'store'), env: { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'lark', key: 'co', label: 'Company app', values: larkPreset }]) }, now: () => Date.now(), broadcast: () => {}, drivePresets: () => [drive], log: quiet });
  const fixed = `http://127.0.0.1:${await freePort()}/lark/cb`;
  const oauth = OL.createOAuthLoopback({ log: quiet, fixedCallbackUrl: fixed });
  const e = ENG.create({ dataDir: path.join(dir, 'eng'), env, serverSetting, broadcast: () => {}, integrations, log: quiet, fetch: fetchFn, oauth, publicUrl: () => publicUrl });
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
  ];
  const refs = hits(/\bRELAY_DEFAULT\b/);
  const roleOf = (x) => (ROLES.find(([re]) => re.test(x.line)) || [])[1] || null;
  const stray = refs.filter((x) => !roleOf(x));
  ok(refs.length >= 12 && !stray.length && refs.some((x) => roleOf(x) === 'the custom app\'s setup words'), `every RELAY_DEFAULT reference in src/ (${refs.length}) is a custom-app role or a comment — none reaches a preset row`, stray.map((x) => `${x.f}:${x.n} ${x.line.slice(0, 140)}`));
  const REG = require(path.join(REPO, 'src/integration-registry.js'));
  const presetFields = ['lark', 'gmail', 'slack', 'dropline'].map((id) => (REG.rowById(id).fields || []).find((f) => f.key === 'relayUrl')).filter(Boolean);
  ok(presetFields.length === 4 && presetFields.every((f) => f.default === undefined && !String(f.placeholder || '').includes(host) && !String(f.help || '').includes(host) && !/public page/.test(String(f.help || ''))), 'no registry row\'s relayUrl field (a company preset\'s value) defaults to, shows or names the public page', presetFields.map((f) => [f.key, f.default, f.placeholder]));
}

await new Promise((r) => vendor.close(r));
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
