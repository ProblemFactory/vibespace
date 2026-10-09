'use strict';
/**
 * CHANNELS ROUTES (docs/design-communication-panel.zh.md §10.2, §16).
 *
 * EVERY ROUTE TAKES `host` AND PASSES IT DOWN — `hostId` is a PARAMETER, never
 * a branch (decision 15). v1 is LOCAL ONLY, and that is expressed as a NAMED
 * REFUSAL for any other machine rather than as a missing parameter: when the
 * fleet half lands, the signature does not change and no caller is rewritten.
 * A silent local answer to a question about another machine is the failure
 * this rule exists to stop.
 *
 * `GET /api/channels` returns the index DIGEST — adapters, conversations,
 * their resolved `convCaps`, their offers and their freshness claims — and
 * NEVER message bodies. Bodies come from the messages route, one page at a
 * time, because a vendor body is hostile input that syncs to every client
 * (fence 5) and because the panel must stay a panel.
 *
 * EVERY MUTATION BROADCASTS the recomputed digest through the engine's ONE
 * notify point (the cache-invalidation law: one dirty signal, one
 * computation), and every failure answers `{error}` with a reason — `fetchJson`
 * never throws, so a route that returned 200-with-nothing would be a silent
 * failure of a user action.
 */
const fs = require('fs');
const express = require('express');
const { contentDisposition } = require('../file-disposition.js');   // lane-raw-filename: THE Content-Disposition builder
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

const bad = (res, code, error, extra = {}) => res.status(code).json({ error, ...extra });

/** 2.369.195: a storage mount's OAuth client is the OWNER's — an agent's
 *  session / job token may neither list the mounts that hold one nor start a
 *  sign-in that borrows one (the reset-credit / desktop-apps rule). With
 *  sign-in on, the cookie gate already stops a bearer-only caller; this is
 *  the named refusal for the instance whose sign-in is off. */
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
function refuseAgentMountChoice(req, res) {
  const b = req.method === 'GET' ? null : (req.body || {});
  if (!isAgentBearer(req) || (b && typeof b.fromMount !== 'string')) return false;
  bad(res, 403, 'a storage mount\'s OAuth client is the owner\'s — an agent token may not list or borrow one', { code: 'agent-forbidden' });
  return true;
}
/** verify r2: the owner-only config (D3, the custom client's secret in the
 *  clear) refuses a SELF-IDENTIFYING agent bearer by name too — the same
 *  courtesy as the mount routes on an instance whose sign-in is off (with
 *  sign-in on the cookie gate answers 401 before this). verify r4: so does
 *  every verb that BEGINS or COMPLETES a consent (start / connect /
 *  re-authorize / the two paste-backs) whatever the body names — a sign-in
 *  is the owner's act (a browser page they approve), and since r3 the
 *  consent machine ends the OLDEST open sign-in when a 33rd begins, so a
 *  bearer that could begin 33 could end the owner's. */
function refuseAgentBearer(req, res, what = 'an account\'s configuration is the owner\'s — an agent token may not read it') {
  if (!isAgentBearer(req)) return false;
  bad(res, 403, what, { code: 'agent-forbidden' });
  return true;
}
const SIGNIN_IS_OWNERS = 'a sign-in is the owner\'s — an agent token may not start, follow or complete one';
/** verify r5: the same courtesy on every verb that ENDS a sign-in or touches
 *  an account's credential or standing (cancel / disconnect / remove /
 *  duplicate / the Edit dialog's PUT — a secret rewrite, a policy flip) and
 *  on the status poll (the running consent URL carries the flow's `state`:
 *  read it and a forged landing ends the owner's sign-in with a vendor
 *  refusal). The agent surface is /api/agent/channels/*, never these. */
const ACCOUNT_IS_OWNERS = 'an account is the owner\'s — an agent token may not change, end or remove one';
/** lane owner-composer-attach: the owner's own send (words + files, no approval) — an agent drafts through /api/agent/channels/*. */
const OWN_SEND_IS_OWNERS = 'sending as the owner is the owner\'s — an agent token proposes a reply instead';
const RULE_PREVIEW_IS_OWNERS = 'a notification rule\'s preview is the owner\'s — an agent token may not run one';
/** verify r2: a `fromMount` that is present but not a storage mount id (a
 *  number, an object, an array, the empty string) is refused BY NAME — it
 *  used to be dropped by `choiceOf` and the consent began under the DEFAULT
 *  client, the field the request named deciding nothing. `null` = absent. */
function refuseMalformedMount(req, res) {
  const b = req.body || {};
  if (b.fromMount === undefined || b.fromMount === null || (typeof b.fromMount === 'string' && b.fromMount)) return false;
  bad(res, 400, 'fromMount must be a storage mount id (a non-empty string)', { code: 'bad-request' });
  return true;
}

/** THE host parameter. v1 serves device #0 only and SAYS so for anything else. */
function forHost(req) {
  const host = (req.method === 'GET' ? req.query.host : (req.body && req.body.host)) || null;
  if (host && host !== 'local') {
    const e = new Error(`Channels v1 runs on this machine only — '${host}' is not served yet`);
    e.status = 501; e.code = 'host-not-served';
    throw e;
  }
  return null; // device #0
}

function engine() {
  const e = ctx && ctx.getEngine && ctx.getEngine();
  if (!e) { const err = new Error('Channels are not available on this instance'); err.status = 503; err.code = 'unavailable'; throw err; }
  return e;
}

/** A typed adapter failure answers with a status BY CODE: a missing
 *  application credential is 409 `needs-credentials` (the wizard opens the
 *  Integrations card), an undeclared capability 501, a vendor refusal 502. */
function fail(res, e) {
  let status = e && e.status;
  let code = (e && e.code) || null;
  const detail = (e && e.detail) || null;
  if (!status && e && e.name === 'ChannelError') {
    if (code === 'auth-expired' && detail && detail.needsCredentials) { status = 409; code = 'needs-credentials'; }
    else if (code === 'not-supported') status = 501;
    else if (code === 'auth-expired') status = 401;
    else status = 502;
  }
  // `detail` is WHITELISTED: the refusal's structure the client words (the
  // missing fields, a custom client's per-field complaints — field → rule,
  // never a value — and the named references a Remove is refused for)
  return res.status(status || 500).json({ error: String((e && e.message) || e), code, detail: detail && typeof detail === 'object' ? { missing: detail.missing || undefined, needsCredentials: detail.needsCredentials || undefined, code: detail.code || undefined, errors: detail.errors || undefined, refs: detail.refs || undefined, key: detail.key || undefined, offered: detail.offered || undefined } : null });
}

/** The client choice a body names (r4 §2.4): `credentialKey` (`cluster:<k>`
 *  | `custom`), `clientPreset` (the storage dialog's spelling), `credential
 *  {appId, appSecret}` / `clientId` + `clientSecret` (a custom client — the
 *  plaintext reaches the engine, is sealed there and is never echoed). */
/** design 018: the origin the BROWSER used to reach this instance (its `Origin` header on the dialog's POST, else the
 *  Host it asked) — the Slack consent state carries it so the relay page can send the browser back. Judged again by
 *  slack-manifest's `originOf` before it is signed. */
function requestOrigin(req) {
  const o = req.headers && req.headers.origin;
  if (typeof o === 'string' && o && o !== 'null') return o.slice(0, 300);
  const h = typeof req.get === 'function' ? req.get('host') : null;
  return h ? `${req.protocol}://${String(h).slice(0, 255)}` : null;
}
function choiceOf(b) {
  const out = {};
  // 2.369.195: a storage mount's own client, copied SERVER-SIDE (never a secret in this body)
  if (typeof b.fromMount === 'string') out.fromMount = b.fromMount;
  if (typeof b.credentialKey === 'string') out.credentialKey = b.credentialKey;
  if (typeof b.clientPreset === 'string') out.clientPreset = b.clientPreset;
  if (b.credential && typeof b.credential === 'object' && !Array.isArray(b.credential)) out.credential = { appId: b.credential.appId, appSecret: b.credential.appSecret };
  if (typeof b.clientId === 'string') out.clientId = b.clientId;
  if (typeof b.clientSecret === 'string') out.clientSecret = b.clientSecret;
  return out;
}

// ── r4: THE ACCOUNT DIALOG'S SIGN-IN (design-integrations-per-account §2.4) ──
/** The storage dialog's consent shape (`/api/mounts/gdrive-auth/*`) for an
 *  account that does not exist yet: START `{kind, clientPreset |
 *  credentialKey | clientId + clientSecret | credential, options?}` →
 *  `{flowId, url, flow}`; STATUS `?flowId=` (omitted = the latest) →
 *  `{running, done, ok, error, user, token}` where `token` is the FLOW ID
 *  once signed in (the handle the shared block writes into its field and
 *  Connect submits — never a credential); CALLBACK `{url, flowId?}` = the
 *  paste-back. The record is created only by `connect {flowId}`. Declared
 *  BEFORE `GET /api/channels/:adapterId/:convId`, which would match. */
// B-2198 THE RAW API — the OWNER's side (the API access dialog, the proposal cards, the API log). An agent bearer is
// refused first: the tier is the user's to grant, a proposal the user's to decide (the agent surface is
// /api/agent/channels/api*).
const API_IS_OWNERS = 'API access and its proposals are the owner\'s — an agent token may not grant, approve or read them here';
const rawApi = () => { const e = engine(); if (!e || !e.rawApi) { const err = new Error('Channels are not available'); err.status = 503; throw err; } return e.rawApi; };
router.get('/api/channels/api', (req, res) => {
  try { if (refuseAgentBearer(req, res, API_IS_OWNERS)) return; const e = engine(); res.json({ ...rawApi().ownerView(), cards: e && e.apiCards ? e.apiCards.records() : [] }); } catch (e) { fail(res, e); }
});
router.put('/api/channels/api/:cred/grants', async (req, res) => {
  try { if (refuseAgentBearer(req, res, API_IS_OWNERS)) return; const r = await rawApi().setTiers(String(req.params.cred), (req.body || {}).grants, { by: 'user' }); res.status(r.ok ? 200 : r.code === 'not-found' ? 404 : 400).json(r); } catch (e) { fail(res, e); }
});
router.get('/api/channels/api/:cred/log', (req, res) => {
  try { if (refuseAgentBearer(req, res, API_IS_OWNERS)) return; res.json({ ok: true, lines: rawApi().auditTail(String(req.params.cred), { n: Number(req.query.n) || 100 }) }); } catch (e) { fail(res, e); }
});
router.post('/api/channels/api/proposals/:id/approve', async (req, res) => {
  try { if (refuseAgentBearer(req, res, API_IS_OWNERS)) return; const shown = (req.body || {}).shown; const cur = shown ? (rawApi().ownerView().proposals || []).find((p) => p.id === String(req.params.id)) : null; if (shown && cur && cur.digest !== shown) return res.status(409).json({ ok: false, code: 'proposal_changed', error: 'that card is not this proposal any more — nothing ran' }); const r = await rawApi().approve(String(req.params.id), { always: !!(req.body || {}).always, by: 'user', digest: String(shown || (req.body || {}).digest || '') }); res.status(r.ok ? 200 : r.code === 'not-found' ? 404 : 409).json(r); } catch (e) { fail(res, e); }
});
router.post('/api/channels/api/proposals/:id/reject', (req, res) => {
  try { if (refuseAgentBearer(req, res, API_IS_OWNERS)) return; const r = rawApi().reject(String(req.params.id), { reason: (req.body || {}).reason || null, by: 'user' }); res.status(r.ok ? 200 : r.code === 'not-found' ? 404 : 409).json(r); } catch (e) { fail(res, e); }
});
router.delete('/api/channels/api/shapes/:id', (req, res) => {
  try { if (refuseAgentBearer(req, res, API_IS_OWNERS)) return; const r = rawApi().revokeShape(String(req.params.id)); res.status(r.ok ? 200 : 404).json(r); } catch (e) { fail(res, e); }
});
router.post('/api/channels/oauth/start', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentMountChoice(req, res)) return;
    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;   // verify r4
    if (refuseMalformedMount(req, res)) return;
    const b = req.body || {};
    res.json({ ok: true, ...(await engine().startOAuth({ kind: typeof b.kind === 'string' ? b.kind : (typeof b.backend === 'string' ? b.backend : ''), ...choiceOf(b), options: b.options, origin: requestOrigin(req) })) });
  } catch (e) { fail(res, e); }
});
/** THE STORAGE MOUNTS WHOSE OWN OAUTH CLIENT AN ACCOUNT OF `kind` MAY
 *  BORROW (2.369.195): `?kind=gmail` → `{kind, vendor, clients:[{mountId,
 *  name, type, email, clientIdPrefix}]}` — never a secret, never the whole
 *  id; `vendor: null` + `[]` for a type no mount can serve (Lark). The
 *  account dialogs offer each as "From storage: …"; `fromMount: <mountId>`
 *  on start / connect / re-authorize copies it server-side. Owner only:
 *  an agent bearer is `403 agent-forbidden`. Declared BEFORE
 *  `GET /api/channels/:adapterId/:convId`, which would match. */
router.get('/api/channels/oauth/mount-clients', (req, res) => {
  try {
    forHost(req);
    if (refuseAgentMountChoice(req, res)) return;
    res.json(engine().mountClientsFor(typeof req.query.kind === 'string' ? req.query.kind : ''));
  } catch (e) { fail(res, e); }
});
router.get('/api/channels/oauth/status', (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;   // verify r5: the consent URL (its state) is the owner's
    res.json(engine().oauthStatus(typeof req.query.flowId === 'string' ? req.query.flowId : null));
  } catch (e) { fail(res, e); }
});
/** THE ONE NARROWING RETRY of a sign-in that runs before its account exists (owner ruling 2026-09-28): `{flowId}` →
 *  `{flowId, flow}` — the same flow, a consent URL without the optional scopes the vendor refused on its page;
 *  `409 already-narrowed` the second time, `409 nothing-optional`, `404 no-flow`. */
router.post('/api/channels/oauth/narrow', (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;
    const b = req.body || {};
    res.json({ ok: true, ...engine().oauthNarrow(typeof b.flowId === 'string' ? b.flowId : null) });
  } catch (e) { fail(res, e); }
});
/** 2.369.214: THE LANDING'S DOOR LIMIT — the landing is cookie-free (src/auth.js exempts exactly this GET), so a
 *  fixed one-minute window per remote address bounds what anybody can make it judge: the 31st landing in a minute is
 *  429 with the landing page's own refused words, BEFORE the state is looked at. Bounded: at most LANDING_IPS
 *  addresses are remembered (the oldest window forgotten first). */
const LANDING_PER_MIN = 30, LANDING_WINDOW_MS = 60 * 1000, LANDING_IPS = 1000;
const landingHits = new Map();   // remote address → { at, n }
function landingAllowed(ip, t = Date.now()) {
  let h = landingHits.get(ip);
  if (!h || t - h.at >= LANDING_WINDOW_MS || t < h.at) {   // verify r1: a clock stepped BACK starts a new window (never pins an address)
    landingHits.delete(ip);
    if (landingHits.size >= LANDING_IPS) landingHits.delete(landingHits.keys().next().value);
    h = { at: t, n: 0 };
    landingHits.set(ip, h);
  }
  return ++h.n <= LANDING_PER_MIN;
}
const LANDING_HEADERS = Object.freeze({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
/** design 018: THE CONSENT LANDING — the vendor (or its relay page) sends the member's browser here with `code` +
 *  `state` (`error=access_denied` when they declined). 2.369.214: NO COOKIE IS ASKED — the browser that pressed Allow
 *  is often another profile (the person's identity at the vendor lives apart from their VibeSpace login), the normal
 *  case and not an error. The STATE is the flow's credential: this boot's HMAC, its age, a running flow of `:kind`,
 *  used once; the landing only moves a pending flow to done — the record is still made by the owner's tab (Connect
 *  {flowId}). lane dc-channels-consent: the page is `:kind`'s declared consent row's (`landing.landingHtml`, the
 *  engine's `consentLandingOf`) — a kind with no landing row is 404 by name. Never the code, the state, a stack or a
 *  secret. */
router.get('/api/channels/oauth/cb/:kind', async (req, res) => {
  const q = req.query || {};
  const one = (v) => (typeof v === 'string' ? v.slice(0, 2048) : null);
  const kind = String(req.params.kind || '').slice(0, 20);
  const pageOf = () => { try { return engine().consentLandingOf(kind); } catch { return null; } };
  // the door limit judges the ADDRESS before anything else is looked at; its page is :kind's own (the refused words for
  // 'too-many' — wait a minute, reload), a kind with no landing row answers JSON
  if (!landingAllowed(req.socket.remoteAddress || '?')) { const p = pageOf(); return p ? res.status(429).set(LANDING_HEADERS).send(p({ ok: false, why: 'too-many' })) : res.status(429).json({ error: 'too many sign-in landings from this address in the last minute — wait a minute', code: 'too-many' }); }
  let r, page = null;
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;
    page = pageOf();
    if (page) r = await engine().oauthLanding({ kind, code: one(q.code), state: one(q.state), error: one(q.error) });
  } catch { r = { ok: false, why: 'failed', user: null, error: null }; }
  page = page || pageOf();
  if (!page) return res.status(404).json({ error: `no consent lands here for "${kind}" — that account type declares no consent landing`, code: 'no-landing' });
  r = r || { ok: false, why: 'failed', user: null, error: null };
  res.status(r.ok || r.why === 'denied' ? 200 : 400).set(LANDING_HEADERS).send(page(r));
});
router.post('/api/channels/oauth/callback', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;   // verify r4
    const b = req.body || {};
    const r = await engine().oauthCallback({ url: b.url, flowId: typeof b.flowId === 'string' ? b.flowId : null, box: typeof b.box === 'string' ? b.box : null });
    if (!r.ok) return bad(res, 400, r.error || 'the consent flow failed', { code: 'auth-failed', ...(r.why ? { detail: { code: r.why } } : {}) });
    res.json(r);
  } catch (e) { fail(res, e); }
});

// ── P1: connect / re-authorize / paste-back / cancel / disconnect / options ──
/** CONNECT (r4): `{flowId, name?, options?}` = the account dialog's Connect
 *  — the record is created here from a finished sign-in (`404 no-flow`,
 *  `409 flow-not-done` / `flow-failed`, `400 flow-client-mismatch`). Without
 *  `flowId` (the pre-r4 wizard): a NEW account under the body's client
 *  choice (`cluster:<k>` | `custom` + credential — `400 unknown-credential`
 *  / `invalid-client` / `own-retired` by name; omitted = the row's pick)
 *  whose consent begins at once; without `newAccount` on a type that has an
 *  account the FIRST account is re-authorized. `409 needs-credentials` when
 *  the chosen client resolves to none. */
router.post('/api/channels/adapters/:kind/connect', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentMountChoice(req, res)) return;
    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;   // verify r4
    if (refuseMalformedMount(req, res)) return;
    const b = req.body || {};
    // r4: `{flowId, name?, options?}` = the account dialog's Connect (the
    // record is created HERE from a finished sign-in); a client choice in
    // the same body must be the flow's (`400 flow-client-mismatch`)
    res.json(await engine().connect(req.params.kind, { ...choiceOf(b), newAccount: b.newAccount === true, flowId: typeof b.flowId === 'string' ? b.flowId : null, name: typeof b.name === 'string' ? b.name : null, options: b.options }));
  } catch (e) { fail(res, e); }
});
/** RE-AUTHORIZE one ACCOUNT by its adapter id (never by kind), the mount
 *  semantics (r4 §2.4): the same client (or none named) ⇒ its consent
 *  begins; a DIFFERENT client in the body IS a re-authorization under it —
 *  `{rebind:true}`, and the account's client and token are replaced
 *  together when that consent lands (until then it keeps both). The pre-r4
 *  `400 credential-bound` refusal is gone. `404 no-such-adapter`. */
router.post('/api/channels/adapters/:id/reauthorize', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentMountChoice(req, res)) return;
    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;   // verify r4
    if (refuseMalformedMount(req, res)) return;
    res.json(await engine().reauthorize(req.params.id, { ...choiceOf(req.body || {}), origin: requestOrigin(req) }));
  } catch (e) { fail(res, e); }
});
/** DUPLICATE (r4 §8.1 #2): `{name?}` → `{adapter}` — a NEW, UNAUTHORIZED
 *  account carrying exactly the engine's declared `DUPLICATE_FIELDS`; the
 *  client then runs its own consent (reauthorize). */
router.post('/api/channels/adapters/:id/duplicate', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, ACCOUNT_IS_OWNERS)) return;   // verify r5
    const b = req.body || {};
    res.json(await engine().duplicate(req.params.id, { name: typeof b.name === 'string' ? b.name : null }));
  } catch (e) { fail(res, e); }
});
/** REMOVE (r4 §8.1 #5): `409 account-referenced {detail.refs:[{kind:
 *  'assignment'|'reach'|'outbox', …}]}` BY NAME while anything points at the
 *  account; otherwise the record and its index rows go. Disconnect is not
 *  this verb (it only drops the token). */
router.delete('/api/channels/adapters/:id', async (req, res) => {
  try { forHost(req); if (refuseAgentBearer(req, res, ACCOUNT_IS_OWNERS)) return; res.json(await engine().remove(req.params.id)); } catch (e) { fail(res, e); }   // verify r5
});
/** THE OWNER'S CONFIG (D3 — the storage `GET /api/mounts/:id/config` rule):
 *  every parameter the Edit dialog prefills, the custom client's secret in
 *  the clear. Cookie-auth only, never broadcast, never logged, never an
 *  agent route (the agent surface is /api/agent/channels/* and does not
 *  reach this); verify r2: a self-identifying agent bearer is refused
 *  `403 agent-forbidden` here too (sign-in off: the named courtesy). */
router.get('/api/channels/adapters/:id/config', (req, res) => {
  try { forHost(req); if (refuseAgentBearer(req, res)) return; res.json({ config: engine().adapterConfig(req.params.id) }); } catch (e) { fail(res, e); }
});
/** ONE ACCOUNT AS IT STANDS NOW (mirror-193): the same adapter view the digest carries, read fresh — the Grant
 *  access… / Notify… dialogs of the account and rule grains draw from THIS, never from the panel's broadcast-fed
 *  copy (a frame behind a route write, the copy made the dialog write a stale list over a newer one). */
router.get('/api/channels/adapters/:id/view', (req, res) => {
  try {
    forHost(req);
    const rec = engine().adapterRecords().adapters.find((r) => r.id === req.params.id);
    if (!rec) return bad(res, 404, 'no such account', { code: 'no-such-adapter' });
    res.json({ adapter: engine().adapterView(rec) });
  } catch (e) { fail(res, e); }
});
/** PASTE-BACK: the user pastes the redirect URL their browser landed on. */
router.post('/api/channels/adapters/:id/auth/finish', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return;   // verify r4
    const url = req.body && req.body.url;
    if (!url || typeof url !== 'string') return bad(res, 400, 'url is required (the redirect URL your browser landed on)', { code: 'bad-request' });
    const r = await engine().finishAuth(req.params.id, url);
    if (!r.ok) return bad(res, 400, r.error || 'the consent flow failed', { code: 'auth-failed' });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
/** …and of an ACCOUNT's running sign-in (Re-authorize): `{flow}` with the narrower consent URL. */
router.post('/api/channels/adapters/:id/auth/narrow', (req, res) => {
  try { forHost(req); if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return; res.json({ ok: true, ...engine().narrowAuth(req.params.id) }); } catch (e) { fail(res, e); }
});
router.post('/api/channels/adapters/:id/auth/cancel', async (req, res) => {
  try { forHost(req); if (refuseAgentBearer(req, res, SIGNIN_IS_OWNERS)) return; res.json(await engine().cancelAuth(req.params.id)); } catch (e) { fail(res, e); }   // verify r5
});
router.post('/api/channels/adapters/:id/disconnect', async (req, res) => {
  try { forHost(req); if (refuseAgentBearer(req, res, ACCOUNT_IS_OWNERS)) return; res.json(await engine().disconnect(req.params.id)); } catch (e) { fail(res, e); }   // verify r5
});
// ── 2026-09-26: THE ACCOUNT AND PATTERN GRAINS (design §7.3) ────────────
// Declared BEFORE every `/api/channels/:adapterId/:convId/…` route, which
// would otherwise swallow `/api/channels/adapters/<id>/assignment`.
/** A scope verb's typed answer → status BY CODE. `why` (the validator's
 *  closed refusal code) and `rule` (the refused rule's kind) are what the
 *  client words the refusal with (channel-words' routeErrorText) — the
 *  English `error` stays the contract, never the toast. */
/** R4: the refusal codes of the two operations (access / notification) —
 *  400 unless named otherwise; `principal` + `index` name the refused row. */
const GRAIN_400 = ['bad-assignment', 'bad-pattern', 'bad-filter', 'no-such-filter', 'bad-request', 'bad-access', 'bad-watcher', 'duplicate-principal', 'watcher-needs-access', 'too-many-rows', 'bad-policy'];
function scopeAnswer(res, r) {
  if (r && r.ok) return res.json(r);
  const code = (r && r.code) || 'error';
  const status = code === 'not-found' ? 404 : code === 'authority-capped' || code === 'grain-changed' || code === 'policy-changed' ? 409 : GRAIN_400.includes(code) ? 400 : 500;
  return res.status(status).json({ error: (r && r.error) || 'refused', code, ...(r && r.why ? { why: r.why } : {}), ...(r && r.rule ? { rule: r.rule } : {}), ...(r && r.principal ? { principal: r.principal } : {}), ...(r && r.index !== undefined ? { index: r.index } : {}) });
}
// ── R4 (2026-09-27): TWO OPERATIONS PER GRAIN, ACCESS FIRST ─────────────
// `PUT …/access {access:[{principal, authority}]}` — GRANT ACCESS (who may
// see and act); `PUT …/watchers {watchers:[{principal, notify, mode, filter?
// | filterId, digestMinutes, dailyWakeCap, receiptWake}]}` — NOTIFY (who is
// woken); a watcher whose principal holds no access at that grain is
// refused `watcher-needs-access`. The account grain is `adapters/:id/…`, a
// rule `adapters/:id/patterns/:pid/…` (a NEW rule: `POST …/patterns
// {pattern, access[, watchers]}`), a conversation `/:adapterId/:convId/…`.
const listOf = (b, key) => (b && Object.prototype.hasOwnProperty.call(b, key) ? b[key] : undefined);
router.put('/api/channels/adapters/:id/access', async (req, res) => {
  try {
    forHost(req);
    const list = listOf(req.body, 'access');
    if (list === undefined) return bad(res, 400, 'access is required (a list of {principal, authority}; [] removes everyone)', { code: 'bad-request' });
    scopeAnswer(res, await engine().setAccess(req.params.id, { kind: 'account' }, list, { base: req.body.base }));
  } catch (e) { fail(res, e); }
});
router.put('/api/channels/adapters/:id/watchers', async (req, res) => {
  try {
    forHost(req);
    const list = listOf(req.body, 'watchers');
    if (list === undefined) return bad(res, 400, 'watchers is required (a list; [] notifies nobody)', { code: 'bad-request' });
    scopeAnswer(res, await engine().setWatchers(req.params.id, { kind: 'account' }, list, { base: req.body.base }));
  } catch (e) { fail(res, e); }
});
router.put('/api/channels/adapters/:id/patterns/:pid/access', async (req, res) => {
  try {
    forHost(req);
    const list = listOf(req.body, 'access');
    if (list === undefined) return bad(res, 400, 'access is required', { code: 'bad-request' });
    scopeAnswer(res, await engine().setGrain(req.params.id, { kind: 'pattern', id: req.params.pid }, { access: list, ...(req.body.pattern !== undefined ? { pattern: req.body.pattern } : {}), ...(req.body.base !== undefined ? { base: req.body.base } : {}) }));
  } catch (e) { fail(res, e); }
});
router.put('/api/channels/adapters/:id/patterns/:pid/watchers', async (req, res) => {
  try {
    forHost(req);
    const list = listOf(req.body, 'watchers');
    if (list === undefined) return bad(res, 400, 'watchers is required', { code: 'bad-request' });
    scopeAnswer(res, await engine().setWatchers(req.params.id, { kind: 'pattern', id: req.params.pid }, list, { base: req.body.base }));
  } catch (e) { fail(res, e); }
});
/** THE ACCOUNT GRAIN — `{assignment}` or `{assignment:null}`; the filter
 *  rides inside (`assignment.filter`). */
router.put('/api/channels/adapters/:id/assignment', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    if (!('assignment' in b)) return bad(res, 400, 'assignment is required (an object, or null to unassign)', { code: 'bad-request' });
    scopeAnswer(res, await engine().setScopeAssignment(req.params.id, { kind: 'account' }, b.assignment === null ? null : { ...(b.assignment || {}), estimateAtSet: b.estimateAtSet || null }));
  } catch (e) { fail(res, e); }
});
/** THE PATTERN GRAIN — create (`POST`), replace (`PUT …/:pid`), remove
 *  (`DELETE …/:pid`); `assignment.pattern` = `{match, rules[]}` over
 *  conversation facts (title / participant / from-address / kind). */
// R4: `{pattern, access[, watchers]}` = the rule + its two lists; the
// pre-split `{assignment}` body is the COMPATIBILITY write (one access row +
// one watcher row).
router.post('/api/channels/adapters/:id/patterns', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    if (b.assignment !== undefined) return scopeAnswer(res, await engine().setScopeAssignment(req.params.id, { kind: 'pattern' }, { ...(b.assignment || {}), estimateAtSet: b.estimateAtSet || null }));
    scopeAnswer(res, await engine().setGrain(req.params.id, { kind: 'pattern' }, { pattern: b.pattern, access: b.access === undefined ? [] : b.access, ...(b.watchers !== undefined ? { watchers: b.watchers } : {}) }));
  } catch (e) { fail(res, e); }
});
router.put('/api/channels/adapters/:id/patterns/:pid', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    if (b.assignment !== undefined) return scopeAnswer(res, await engine().setScopeAssignment(req.params.id, { kind: 'pattern', id: req.params.pid }, { ...(b.assignment || {}), estimateAtSet: b.estimateAtSet || null }));
    scopeAnswer(res, await engine().setGrain(req.params.id, { kind: 'pattern', id: req.params.pid }, { ...(b.pattern !== undefined ? { pattern: b.pattern } : {}), ...(b.access !== undefined ? { access: b.access } : {}), ...(b.watchers !== undefined ? { watchers: b.watchers } : {}), ...(b.base !== undefined ? { base: b.base } : {}) }));
  } catch (e) { fail(res, e); }
});
router.delete('/api/channels/adapters/:id/patterns/:pid', async (req, res) => {
  try { forHost(req); scopeAnswer(res, await engine().removePattern(req.params.id, req.params.pid)); } catch (e) { fail(res, e); }
});
/** THE HONEST ESTIMATE over a scope, BEFORE saving: `{scope:{kind:'account'|
 *  'pattern'}, pattern?, filter?, notify?, digestMinutes?, dailyWakeCap?}` →
 *  `{estimate:{…, conversations, covered, sampled}, expectedWakesPerDay}`. */
router.post('/api/channels/adapters/:id/estimate', (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    scopeAnswer(res, engine().estimateScope(req.params.id, b.scope || { kind: 'account' }, { filter: b.filter === undefined ? null : b.filter, pattern: b.pattern || null, notify: b.notify || 'wake', digestMinutes: b.digestMinutes, dailyWakeCap: b.dailyWakeCap, principal: b.principal || null }));
  } catch (e) { fail(res, e); }
});

/** THE RULE PREVIEW (lane notify-rules-r2) — `{rule, scope:{kind:'account'|'pattern'}, pattern?}` → the newest ≤ 10
 *  stored messages ONE keyword / regex rule matches, from the LOCAL logs only (zero vendor calls). OWNER-ONLY: the
 *  dialog is the owner's, and the answer carries message text an agent's own reach never judged. */
router.post('/api/channels/adapters/:id/rules/preview', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, RULE_PREVIEW_IS_OWNERS)) return;
    const b = req.body || {};
    scopeAnswer(res, await engine().previewRule(req.params.id, b.scope || { kind: 'account' }, { rule: b.rule || null, pattern: b.pattern || null }));
  } catch (e) { fail(res, e); }
});

/** ENABLE / OPTIONS / PUSH: `{enabled?}`, `{options:{…}}` (an option the
 *  adapter did not declare is refused by name) and/or `{push:{enabled?,
 *  claimedExclusive?}}` (P1b, design §6.4: the push switch and the
 *  exclusivity DECLARATION — a re-declaration clears a demotion and retries
 *  the lane once; `400 no-push-lane` on an adapter without one). */
router.put('/api/channels/adapters/:id', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, ACCOUNT_IS_OWNERS)) return;   // verify r5: the Edit dialog's saves (a secret, the sending policy) are the owner's
    const b = req.body || {};
    let out = { ok: true };
    if (typeof b.enabled === 'boolean') out = { ...out, ...(await engine().setEnabled(req.params.id, b.enabled)) };
    if (b.options !== undefined) out = { ...out, ...(await engine().setOptions(req.params.id, b.options)) };
    if (b.push !== undefined) out = { ...out, ...(await engine().setPush(req.params.id, b.push)) };
    // P4 (§9.5): the per-channel sender honesty switch — true / false / null
    // (= follow the instance setting `channels.senderHonestyLine`).
    if (b.senderHonestyLine !== undefined) out = { ...out, ...(await engine().setSenderHonesty(req.params.id, b.senderHonestyLine)) };
    // R4 (B-6acc): the ACCOUNT's sending policy — 'direct' | 'review' | null
    // (= the adapter's default); what a composed NEW message reads. Lane account-policy-door: `base` = the value the
    // door read — moved since ⇒ 409 `policy-changed` (the dialog re-reads)
    if (b.policy !== undefined) { const pr = await engine().setAccountPolicy(req.params.id, b.policy, 'user', b.base !== undefined ? { base: b.base } : {}); if (!pr.ok) return scopeAnswer(res, pr); out = { ...out, ...pr }; }
    // r4 (the Edit dialog's in-place saves): the account's name, and a custom
    // client's SECRET for the SAME id (another id / a preset = a client
    // switch = `409 client-change-needs-reauth`: use Re-authorize)
    // lane channel-threads (spec §2.6): the account's row for an AGENT's reactions — propose | direct | off
    if (b.reactionPolicy !== undefined) { const rp = await engine().setReactionPolicy(req.params.id, b.reactionPolicy); if (!rp.ok) return res.status(rp.code === 'not-found' ? 404 : 400).json({ error: rp.error, code: rp.code }); out = { ...out, ...rp }; }
    // lane channel-agent-watch W2: may agents see the LIST of conversations (titles, to request one) — groups / single chats
    if (b.agentDirectory !== undefined) { const ad = await engine().setAgentDirectory(req.params.id, b.agentDirectory); if (!ad.ok) return res.status(ad.code === 'not-found' ? 404 : 400).json({ error: ad.error, code: ad.code }); out = { ...out, ...ad }; }
    if (typeof b.label === 'string') out = { ...out, ...(await engine().setLabel(req.params.id, b.label)) };
    if (b.credential && typeof b.credential === 'object' && !Array.isArray(b.credential)) out = { ...out, ...(await engine().setCustomSecret(req.params.id, { appId: b.credential.appId, appSecret: b.credential.appSecret })) };
    res.json(out);
  } catch (e) { fail(res, e); }
});

/** LIST — THE FIRST SCREEN, never every conversation (design 008, B-3cf8: userW's ≈ 50 000 rows were one 77.5 MB
 *  answer, 1.49 s to first byte): the accounts, the counts, the totals, the attention rows and each account's newest
 *  (`engine.digest({scope: 'first'})`). `?scope=accounts` = the accounts without rows (the window's Re-authorize),
 *  `?scope=totals` = the rail badge's two numbers. Every other row: GET /api/channels/rows. Owner-only — an agent
 *  lists through /api/agent/channels (its reach), never this. */
const CHANNELS_LIST_IS_OWNERS = 'the channels list is the owner\'s — an agent lists conversations through vibespace-channels';
router.get('/api/channels', (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, CHANNELS_LIST_IS_OWNERS)) return;
    const scope = req.query.scope == null || req.query.scope === '' ? 'first' : String(req.query.scope);
    if (!['first', 'accounts', 'totals'].includes(scope)) return bad(res, 400, 'scope must be first, accounts or totals', { code: 'bad-request' });
    res.json(engine().digest({ scope }));
  } catch (e) { fail(res, e); }
});

/** design 008: EVERY OTHER ROW, paged — `?view=all|focus&adapter=&q=&limit=&beforeAt=&beforeKey=` (the cursor of the
 *  last row read), `?key=…` (repeated, ≤ 200 named rows) or `?conv=<id>` (one conversation id across accounts).
 *  `{rows, next, total}`; a bound broken is refused by name (400 bad-request), an unknown account 404. */
router.get('/api/channels/rows', (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, CHANNELS_LIST_IS_OWNERS)) return;
    const qy = req.query || {};
    const one = (x) => (Array.isArray(x) ? x[0] : x);
    // `key=` repeated: the query parser hands an array — past 20 an OBJECT of them (its arrayLimit); both are the list
    const keyList = qy.key == null ? null : Array.isArray(qy.key) ? qy.key : typeof qy.key === 'object' ? Object.values(qy.key) : [qy.key];
    const before = qy.beforeKey != null || qy.beforeAt != null ? { lastAt: Number(one(qy.beforeAt)), key: one(qy.beforeKey) } : null;
    const r = engine().rows({
      view: qy.view == null ? 'all' : String(one(qy.view)), adapter: qy.adapter == null ? null : String(one(qy.adapter)), q: qy.q == null ? '' : String(one(qy.q)),
      before, limit: qy.limit == null ? null : one(qy.limit), keys: keyList ? keyList.map((k) => (typeof k === 'string' ? k : '')) : null, conv: qy.conv == null ? null : String(one(qy.conv)),
    });
    if (!r.ok) return res.status(r.code === 'not-found' ? 404 : 400).json({ error: r.error, code: r.code });
    res.json({ rows: r.rows, next: r.next, total: r.total });
  } catch (e) { fail(res, e); }
});

/** THE ACCOUNTS, NOTHING ELSE (B-df40 part 2, 2026-10-03): the Settings window's
 *  "is an account of this vendor linked" fact (`when: { channel }` rows) — read
 *  ONCE when the window opens, never on a timer. Not the digest: that carries
 *  every conversation, and on a large account it is the heavy read. */
router.get('/api/channels/adapters', (req, res) => {
  try {
    forHost(req);
    res.json({ adapters: engine().adapterRecords().adapters.map((r) => ({ id: r.id, kind: r.kind, builtin: !!r.builtin, enabled: r.enabled !== false })) });
  } catch (e) { fail(res, e); }
});

/** SEARCH one account's messages (2026-09-26, design §6.5): the local logs,
 *  read asynchronously with a byte cap — `{results:[{key, convId, title,
 *  record}], truncated}`. One path segment after /channels, so it never
 *  collides with a conversation route. */
router.get('/api/channels/search', async (req, res) => {
  try {
    forHost(req);
    const r = await engine().search(String(req.query.adapter || ''), String(req.query.q || ''), { limit: Number(req.query.limit) || 100, convId: req.query.conv ? String(req.query.conv) : null });   // .212: `conv` = one conversation (an agent's search row)
    if (!r.ok) return res.status(r.code === 'not-found' ? 404 : 400).json({ error: r.error, code: r.code });
    res.json(r);
  } catch (e) { fail(res, e); }
});
/** THE VENDOR'S OWN SEARCH (design 010, B-c9be): the owner's Search press (no `page`: ≤ the row's pages per press) or
 *  the dialog's scroll to the end of section two (`page` = the previous answer's `next`: one page). The person's act
 *  is the intent; the engine's refusal table (scope, back-off, the 2 s floor, the endpoint's minute, the budget) answers
 *  typed with its wait. Declared BEFORE `/api/channels/:adapterId/:convId` (two segments — it would swallow it).
 *  Lane vendor-search-memo (.230): the account's memo answers a repeat inside its TTL (0 vendor calls, `memo` said);
 *  `again=1` = the dialog's "Search again" (forgets it, then asks); `peek=1` = the dialog OPENING (the memo or
 *  `unasked` — never the vendor). */
router.get('/api/channels/search/full', async (req, res) => {
  try {
    forHost(req);
    readerAnswer(res, await engine().searchVendor(String(req.query.adapter || ''), String(req.query.q || ''), { pageToken: req.query.page ? String(req.query.page) : null, again: req.query.again === '1', peek: req.query.peek === '1', memo: req.query.memo ? String(req.query.memo) : null, convId: req.query.conv ? String(req.query.conv) : null }));   // lane search-card-open: the agent row's memo scope + its conversation
  } catch (e) { fail(res, e); }
});

/** THE WITNESS'S TWO READS (§26, B-099e) — the owner's, cookie-only: an agent's session / job bearer is refused
 *  403 `agent_forbidden` (the reset-credit rule; what the user sees an agent touch is not an agent surface).
 *  `GET /api/channel-touches?sessionId=<webui id>` = that session's ring + its current turn's start (the chat
 *  view's ONE fetch; an unknown / stopped session answers an empty ring, `live:false`);
 *  `GET /api/channels/:adapterId/:convId/touches` = every live session that touched the conversation (the
 *  window's "Drafted by …"): `{touches:[{sessionId, name, op, at, n}]}`, newest first. */
// `isAgentBearer` — the ONE module-scope spelling above (the .195 merge: lane channel-jump and lane client-from-mount each declared it)
function touchesOf(res) {
  const w = ctx && ctx.getTouches && ctx.getTouches();
  if (!w) { res.status(503).json({ error: 'the channel witness is not available', code: 'unavailable' }); return null; }
  return w;
}
router.get('/api/channel-touches', (req, res) => {
  try {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'the user\'s view — not an agent route', code: 'agent_forbidden' });
    const sid = String(req.query.sessionId || '');
    if (!/^[\w.:-]{1,120}$/.test(sid)) return bad(res, 400, 'sessionId is required', { code: 'bad-request' });
    const w = touchesOf(res); if (!w) return;
    res.json(w.list(sid));
  } catch (e) { fail(res, e); }
});
router.get('/api/channels/:adapterId/:convId/touches', (req, res) => {
  try {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'the user\'s view — not an agent route', code: 'agent_forbidden' });
    forHost(req);
    const w = touchesOf(res); if (!w) return;
    res.json(w.forConversation(String(req.params.adapterId), String(req.params.convId)));
  } catch (e) { fail(res, e); }
});

// ── lane channel-threads (2026-09-28, spec §9): THREADS + REACTIONS ────────
/** A thread / reaction verb's typed answer → status BY CODE (every refusal named; the window words the code). */
const RX_STATUS = Object.freeze({
  'not-found': 404, 'no-picture': 404, 'thread-not-loaded': 404, 'bad-request': 400, 'bad-emoji': 400, 'bad-proposal': 400,
  'react-not-available': 409, 'already-reacted': 409, 'reaction-cap': 409, 'not-reactable': 409, 'reaction-not-mine': 409,
  'reactions-scope-not-granted': 409, 'topic-forbidden': 409, 'account-changed': 409, disabled: 409, 'not-a-thread': 409,
  'thread-floor': 429, 'reactions-floor': 429, 'older-floor': 429, 'vendor-budget': 429, backoff: 429, 'rate-limited': 429,
  'not-supported': 501, stopped: 503,
});
function answerRx(res, r) {
  if (r && r.ok) return res.json(r);
  const code = (r && r.code) || 'error';
  if (r && r.retryAfterSec) res.setHeader('Retry-After', String(r.retryAfterSec));
  return res.status(RX_STATUS[code] || 502).json({ ...(r && typeof r === 'object' ? r : {}), error: (r && r.error) || 'refused', code });
}
/** lane channel-avatars (B-5fe1): A PERSON'S PICTURE through OUR route only — the cached bytes (≤ 256 KiB, the type
 *  SNIFFED from the bytes when it was stored, never the vendor's header), `private, max-age=86400`; the vendor's
 *  address (it may carry a token) never reaches a page. A refusal is the engine's code, typed (a person with no
 *  picture is 404 `no-picture`: the surface keeps the initials). */
router.get('/api/channels/avatar', async (req, res) => {
  try {
    forHost(req);
    const account = String(req.query.account || ''), author = String(req.query.author || '');
    const r = await engine().avatarImage(account, author, { convId: req.query.conv ? String(req.query.conv) : null });
    if (!r || !r.ok) { res.setHeader('Cache-Control', 'no-store'); return answerRx(res, r); }
    const mime = String((r.meta && r.meta.mime) || '');
    let st;
    try { st = fs.statSync(r.file); } catch { st = null; }
    if (!INLINE_IMAGE_RX.has(mime) || !st || st.size > AVATAR_MAX_BYTES) { res.setHeader('Cache-Control', 'no-store'); return answerRx(res, { ok: false, code: 'not-found', error: 'no picture' }); }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(st.size));
    const rs = fs.createReadStream(r.file);
    rs.on('error', (e) => { if (!res.headersSent) bad(res, 500, String((e && e.message) || e)); else res.destroy(); });
    rs.pipe(res);
  } catch (e) { fail(res, e); }
});
const AVATAR_MAX_BYTES = 256 * 1024;
/** The picker's vocabulary (cached 6 h): `{keys:[{key, glyph, label, custom}], quick, custom, at}`. */
router.get('/api/channels/:adapterId/emoji-set', async (req, res) => {
  try { forHost(req); answerRx(res, await engine().emojiSet(req.params.adapterId)); } catch (e) { fail(res, e); }
});
/** A CUSTOM emoji's picture through OUR route (attack 22: the key judged by its alphabet before any path) —
 *  the attachment route's headers: nosniff, a sandbox CSP, inline only for a raster picture. */
router.get('/api/channels/:adapterId/emoji/:key', async (req, res) => {
  try {
    forHost(req);
    const r = await engine().emojiImage(req.params.adapterId, req.params.key);
    if (!r || !r.ok) { res.setHeader('Cache-Control', 'no-store'); return answerRx(res, r); }
    const mime = String((r.meta && r.meta.mime) || '').toLowerCase().split(';')[0].trim();
    const raster = INLINE_IMAGE_RX.has(mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', raster ? mime : 'application/octet-stream');
    // the .197 integration (lane-raw-filename's byte census): THE one header builder, never a hand-spelled value
    res.setHeader('Content-Disposition', contentDisposition('emoji.png', raster && String(req.query.inline || '') === '1' ? 'inline' : 'attachment'));
    const st = fs.createReadStream(r.file);
    st.on('error', (e) => { if (!res.headersSent) bad(res, 500, String((e && e.message) || e)); else res.destroy(); });
    st.pipe(res);
  } catch (e) { fail(res, e); }
});
const INLINE_IMAGE_RX = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** OPEN — ONE conversation's FULL view (2026-09-26: the digest rows are slim;
 *  the window's bar, the editors and the reach dialog read this) + its
 *  adapter row. Never a full digest per request. */
router.get('/api/channels/:adapterId/:convId', (req, res) => {
  try {
    forHost(req);
    const eng = engine();
    const conv = eng.conversationView(req.params.adapterId, req.params.convId);
    if (!conv) return bad(res, 404, 'No such conversation');
    const rec = eng.adapterRecords().adapters.find((a) => a.id === conv.adapterId) || null;
    res.json({ conversation: conv, adapter: rec ? eng.adapterView(rec) : null, accounts: eng.accountsBrief() });   // B-5fe1: the bar's account badge
  } catch (e) { fail(res, e); }
});

/**
 * HISTORY PAGING — one page, oldest-first, strictly before the BOUNDARY
 * RECORD `(before, beforeId)`.
 *
 * The boundary is a PAIR, not an instant: `at` is not unique (a Lark burst
 * shares a millisecond, Gmail's `internalDate` is second-derived) and paging
 * on it alone with a strict `<` made every record of such a group at or after
 * a page boundary permanently unreachable. `beforeId` is the boundary
 * record's `vendorId`, which invariant 2 makes unique per conversation; the
 * store orders by `(at, vendorId)`.
 */
// lane lark-threads (B3): THE OWNER'S NAME FOR AN AUTHOR (the VibeSpace 备注) — owner-only (an agent bearer is refused by
// name; with sign-in on the cookie gate answers first); `{alias}` (empty / null clears it). docs/kb-api.md
router.patch('/api/channels/:adapterId/authors/:id', async (req, res) => {
  try {
    if (refuseAgentBearer(req, res, 'a name for an author is the owner\'s — an agent token may not set one')) return;
    const b = req.body || {};
    if (!('alias' in b)) return bad(res, 400, 'alias is required (a string; empty clears it)', { code: 'bad-request' });
    const r = await engine().setAlias(req.params.adapterId, req.params.id, b.alias === null ? '' : b.alias, { by: 'user' });
    if (!r.ok) return bad(res, r.code === 'not-found' ? 404 : 400, r.error, { code: r.code });
    res.json(r);
  } catch (e) { fail(res, e); }
});
router.get('/api/channels/:adapterId/:convId/messages', (req, res) => {
  try {
    forHost(req);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const before = req.query.before ? Number(req.query.before) : null;
    const beforeId = req.query.beforeId ? String(req.query.beforeId) : null;
    const records = engine().messages(req.params.adapterId, req.params.convId, { before, beforeId, limit });
    if (!records) return bad(res, 404, 'No such conversation'); // a conversation the engine does not know (an agent group's log is read by its OWN route, folded)
    res.json({ records, limit, before: before || null, beforeId });
  } catch (e) { fail(res, e); }
});

/** MARK-READ. `at` is optional; the engine re-derives `unread` from the log —
 *  and 404s on an id it does not hold, rather than minting a row for it. */
router.post('/api/channels/:adapterId/:convId/read', async (req, res) => {
  try {
    forHost(req);
    const at = Number(req.body && req.body.at);
    const ok = await engine().markRead(req.params.adapterId, req.params.convId, Number.isFinite(at) ? at : null);
    if (!ok) return bad(res, 404, 'No such conversation');
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

// ── 2026-09-26: THE READER SURFACE (design §6.5) ─────────────────────────
// There is no TRACK route any more: a linked account is an aggregated IM and
// every conversation is fetched (§5 invariant 6 as rewritten).
/** A reader verb's typed answer → status BY CODE (a refusal names its number). */
function readerAnswer(res, r) {
  if (r && r.ok) return res.json(r);
  const code = (r && r.code) || 'error';
  // r5: `refresh-queue-full` (the request set's cap) is a 429 with its wait; `account-changed` (the account rebuilt / removed while the refresh waited) a 409 like `disabled`; `stopped` (the engine stopping) a 503
  // R3: a vendor's own rate limit on an attachment is a 429 with its wait too (the thumbnail retries after it)
  const status = code === 'not-found' ? 404 : code === 'rate-limited' || code === 'refresh-queue-full' || code === 'vendor-budget' || code === 'refresh-floor' || code === 'backoff' ? 429 : code === 'not-supported' ? 501 : code === 'too-large' ? 413 : code === 'bad-request' ? 400 : code === 'disabled' || code === 'account-changed' ? 409 : code === 'stopped' ? 503 : 502;
  if (r && r.retryAfterSec) res.setHeader('Retry-After', String(r.retryAfterSec));
  return res.status(status).json({ ...(r && typeof r === 'object' ? r : {}), error: (r && r.error) || 'refused', code });
}
/** THE REFRESH OVERRIDE ("Refresh every ▸"): `{every: 30|60|300|900|'paused'|null}`. */
router.put('/api/channels/:adapterId/:convId/refresh', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    if (!('every' in b)) return bad(res, 400, 'every is required (30, 60, 300, 900, "paused", or null for automatic)', { code: 'bad-request' });
    readerAnswer(res, await engine().setRefresh(req.params.adapterId, req.params.convId, b.every === null ? null : (b.every === 'paused' ? 'paused' : Number(b.every))));
  } catch (e) { fail(res, e); }
});
/** REFRESH NOW (the owner's "Refresh now"): one conversation, charged to
 *  the account's vendor budget — refused by name when it is spent. */
router.post('/api/channels/:adapterId/:convId/refresh', async (req, res) => {
  try { forHost(req); readerAnswer(res, await engine().refresh(req.params.adapterId, req.params.convId, { origin: 'refresh' })); } catch (e) { fail(res, e); }
});
/** THE WINDOW'S HEARTBEAT: open ⇒ hot (90 s per beat); a stale conversation
 *  is fetched at once. */
router.post('/api/channels/:adapterId/:convId/watch', async (req, res) => {
  try { forHost(req); readerAnswer(res, await engine().watch(req.params.adapterId, req.params.convId)); } catch (e) { fail(res, e); }
});
/** THE OWNER'S Retry on a send row the vendor refused to resolve (lane gmail-reply-known): asked now, exempt from
 *  the account's back-off, one flight per conversation. */
router.post('/api/channels/:adapterId/:convId/caps', async (req, res) => {
  try { forHost(req); readerAnswer(res, await engine().retryConvCaps(req.params.adapterId, req.params.convId)); } catch (e) { fail(res, e); }
});
/** HISTORY ON DEMAND: `{before, beforeId, limit}` — the local page, topped
 *  up from the vendor past the log's start (`exhausted` / `vendorHasNoOlder`
 *  said honestly). */
router.post('/api/channels/:adapterId/:convId/older', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    const before = b.before !== undefined && b.before !== null && b.before !== '' ? Number(b.before) : null;
    readerAnswer(res, await engine().loadOlder(req.params.adapterId, req.params.convId, { before: Number.isFinite(before) ? before : null, beforeId: b.beforeId ? String(b.beforeId) : null, limit: Number(b.limit) || null }));
  } catch (e) { fail(res, e); }
});
/** A FOUND MESSAGE IN CONTEXT (design 010): `?msg=<vendor id>&at=<ms>` — the vendor's history around its instant
 *  (two metered requests, the owner's), drawn by the window's own row renderer and NEVER stored (F8). */
router.get('/api/channels/:adapterId/:convId/around', async (req, res) => {
  try {
    forHost(req);
    readerAnswer(res, await engine().aroundOwner(req.params.adapterId, req.params.convId, { vendorId: req.query.msg ? String(req.query.msg) : null, at: Number(req.query.at) || null }));
  } catch (e) { fail(res, e); }
});
/** ONE THREAD (spec §9): the root + its replies from the LOCAL log — never a vendor call. `msg` = the root's
 *  vendorId (a reply's id answers its thread); a message the log does not hold answers `thread-not-loaded`. */
router.get('/api/channels/:adapterId/:convId/thread/:msg', (req, res) => {
  try {
    forHost(req);
    const before = req.query.before ? Number(req.query.before) : null;
    answerRx(res, engine().threadRead(req.params.adapterId, req.params.convId, req.params.msg, { limit: Number(req.query.limit) || 50, before: Number.isFinite(before) ? before : null, beforeId: req.query.beforeId ? String(req.query.beforeId) : null }));
  } catch (e) { fail(res, e); }
});
/** THE THREAD WALK (drain rule 20a): the pane's open / its beat — paced, metered, a per-thread floor. */
router.post('/api/channels/:adapterId/:convId/thread/:msg/refresh', async (req, res) => {
  try { forHost(req); answerRx(res, await engine().threadRefresh(req.params.adapterId, req.params.convId, req.params.msg)); } catch (e) { fail(res, e); }
});
/** A thread's older replies (the rule-19 belt): the local page, one walk past its start. */
router.post('/api/channels/:adapterId/:convId/thread/:msg/older', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    const before = b.before !== undefined && b.before !== null && b.before !== '' ? Number(b.before) : null;
    answerRx(res, await engine().threadOlder(req.params.adapterId, req.params.convId, req.params.msg, { before: Number.isFinite(before) ? before : null, beforeId: b.beforeId ? String(b.beforeId) : null, limit: Number(b.limit) || null }));
  } catch (e) { fail(res, e); }
});
/** The LOCAL reaction fold for ≤ 50 messages + when each list was last fetched — never a vendor call. */
router.get('/api/channels/:adapterId/:convId/reactions', (req, res) => {
  try {
    forHost(req);
    const ids = String(req.query.ids || '').split(',').map((x) => x.trim()).filter(Boolean);
    answerRx(res, engine().reactionsRead(req.params.adapterId, req.params.convId, ids));
  } catch (e) { fail(res, e); }
});
/** THE TRICKLE (drain rule 20b): the open window's visible rows, ≤ 20 ids — one flight per message, the floor,
 *  the per-minute ceiling, the budget; `{asked, refused:[{id, code}], floorMs}`. */
router.post('/api/channels/:adapterId/:convId/reactions/refresh', async (req, res) => {
  try {
    forHost(req);
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String) : null;
    if (!ids) return answerRx(res, { ok: false, code: 'bad-request', error: 'ids is required (the visible messages, at most 20)' });
    answerRx(res, await engine().reactionsRefresh(req.params.adapterId, req.params.convId, ids));
  } catch (e) { fail(res, e); }
});
/** ADD a reaction AS THE USER (like `/send`: the owner's own act, direct) → the folded list. */
router.post('/api/channels/:adapterId/:convId/messages/:msg/reactions', async (req, res) => {
  try {
    forHost(req);
    const key = req.body && typeof req.body.key === 'string' ? req.body.key : '';
    if (!key) return answerRx(res, { ok: false, code: 'bad-emoji', error: 'key is required (an emoji the channel lists)' });
    answerRx(res, await engine().react(req.params.adapterId, req.params.convId, req.params.msg, key, { by: 'user' }));
  } catch (e) { fail(res, e); }
});
/** REMOVE OUR reaction → the folded list (`reaction-not-mine` when none of ours is there). */
router.delete('/api/channels/:adapterId/:convId/messages/:msg/reactions/:key', async (req, res) => {
  try { forHost(req); answerRx(res, await engine().unreact(req.params.adapterId, req.params.convId, req.params.msg, req.params.key, { by: 'user' })); } catch (e) { fail(res, e); }
});
/** A MESSAGE'S FACTS (lane message-facts, B-f066): the folded list for `?msg=` — a side hit is free; a message stored
 *  before its facts makes ONE metered read of its whole thread (single-flight, the budget, refusals by name; `all` = every
 *  message of the thread it filled). The OWNER's Details click only — an agent token is refused by name (an agent's
 *  read prints what is stored, it never spends the account's budget on a backfill). */
router.get('/api/channels/:adapterId/:convId/facts', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, 'a message\'s details are read by the owner\'s window — an agent reads them with `vibespace-channels read`')) return;
    readerAnswer(res, await engine().messageFacts(req.params.adapterId, req.params.convId, typeof req.query.msg === 'string' ? req.query.msg : ''));
  } catch (e) { fail(res, e); }
});
/** ONE ATTACHMENT (design §6.5): fetched through the adapter on first use,
 *  then served from the account's 0600 LRU cache. NEVER EXECUTED and never
 *  rendered in our origin: `nosniff`, a `default-src 'none'; sandbox` CSP,
 *  `Content-Disposition: attachment` for everything — except a raster image
 *  (png / jpeg / gif / webp; never svg) asked `?inline=1`, which is what the
 *  window's `img.src` thumbnails load. */
const INLINE_IMAGE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
// design 005 §2.B (B-fd1f): a proposal's attachment for the OWNER's card (its thumbnail / its download) — the read
// route's headers: nosniff, a sandbox CSP, inline only for the four raster types the server SNIFFED (an HTML page or an
// SVG named .png downloads), never cached. No agent route serves an outbox file. Declared BEFORE the read route below,
// whose `/:adapterId/:convId/attachment/:id` would otherwise take `/outbox/<id>/attachment/<n>`. verify r1: an agent's / a job's
// bearer is refused by name (C3, the owner views' agent_forbidden — sign-in off has no cookie gate); the engine re-hashes
// the bytes against the record and a rewritten file is a 409, never served (C2).
router.get('/api/channels/outbox/:id/attachment/:n', async (req, res) => {
  try {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'the user\'s view — not an agent route', code: 'agent_forbidden' });
    forHost(req);
    const r = await engine().outboxAttachment(req.params.id, req.params.n);
    res.setHeader('Cache-Control', 'no-store');
    if (r && r.code === 'attachment-changed') return bad(res, 409, r.error, { code: r.code });
    if (!r || !r.ok) return readerAnswer(res, r);
    const mime = String(r.meta.mime || '').toLowerCase();
    const raster = INLINE_IMAGE.has(mime);
    const inline = raster && String(req.query.inline || '') === '1';
    const name = String(r.meta.name || 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Type', raster ? mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(name, inline ? 'inline' : 'attachment') || (inline ? 'inline' : 'attachment')); // THE builder (lane raw-filename): both forms, a CR/LF or a quote never reaches the header
    res.setHeader('Content-Length', String(r.data.length));
    res.end(r.data);
  } catch (e) { fail(res, e); }
});
router.get('/api/channels/:adapterId/:convId/attachment/:id', async (req, res) => {
  try {
    forHost(req);
    // R3 (§23): `retry=1` = the person's Retry on a refused picture — it skips the REMEMBERED refusal
    // (never the budget, never the back-off); a refusal is never cached by the browser (`no-store`), so
    // the thumbnail's own retry asks the server again instead of replaying a 429 from its cache
    const r = await engine().attachment(req.params.adapterId, req.params.convId, req.params.id, { msg: req.query.msg ? String(req.query.msg) : null, retry: String(req.query.retry || '') === '1' });
    if (!r || !r.ok) { res.setHeader('Cache-Control', 'no-store'); return readerAnswer(res, r); }
    const meta = r.meta || {};
    const mime = String(meta.mime || '').toLowerCase().split(';')[0].trim();
    const raster = INLINE_IMAGE.has(mime);
    const inline = raster && String(req.query.inline || '') === '1';
    const name = String(meta.name || 'attachment').replace(/[\r\n"]/g, '_');
    const ascii = name.replace(/[^\x20-\x7e]/g, '_');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', raster ? mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    // THE SIZE, SAID (security verify r2, 2026-09-28): a piped file stream is chunked with no Content-Length, so a
    // reader could not refuse a body over its bound before downloading it — the file's own size rides the answer
    try { const stat = await fs.promises.stat(r.file); if (Number.isFinite(stat.size)) res.setHeader('Content-Length', String(stat.size)); } catch {}
    const st = fs.createReadStream(r.file);
    st.on('error', (e) => { if (!res.headersSent) bad(res, 500, String((e && e.message) || e)); else res.destroy(); });
    st.pipe(res);
  } catch (e) { fail(res, e); }
});

// ── P2: assign / filter / estimate (design §7, §10.2) ─────────────────────
/** A P2 verb's typed answer → status BY CODE: `404 not-found`, `400` for a
 *  malformed assignment/filter or a filter still in use, `409
 *  authority-capped` when `authority:'send'` was asked for on a conversation
 *  where it is not offered (the reason rides `error`). */
function answer(res, r) {
  if (r && r.ok) return res.json(r);
  const code = (r && r.code) || 'error';
  const status = code === 'not-found' ? 404 : code === 'authority-capped' || code === 'grain-changed' ? 409 : code === 'filter-in-use' || GRAIN_400.includes(code) ? 400 : 500;
  return res.status(status).json({ error: (r && r.error) || 'refused', code, ...(r && r.why ? { why: r.why } : {}), ...(r && r.rule ? { rule: r.rule } : {}), ...(r && r.principal ? { principal: r.principal } : {}), ...(r && r.index !== undefined ? { index: r.index } : {}) });
}

/** ASSIGN — `{assignment}` (§7.3) or `{assignment:null}` to unassign.
 *  `estimateAtSet` may ride along (the editor's live estimate at the moment
 *  the user committed to a rate; the panel shows it beside the measurement). */
router.put('/api/channels/:adapterId/:convId/assignment', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    if (!('assignment' in b)) return bad(res, 400, 'assignment is required (an object, or null to unassign)', { code: 'bad-request' });
    const input = b.assignment === null ? null : { ...(b.assignment && typeof b.assignment === 'object' ? b.assignment : {}), estimateAtSet: b.estimateAtSet || (b.assignment && b.assignment.estimateAtSet) || null };
    answer(res, await engine().setAssignment(req.params.adapterId, req.params.convId, input));
  } catch (e) { fail(res, e); }
});
/** R4: GRANT ACCESS / NOTIFY on ONE conversation — the same two operations
 *  as the account and a rule (`{access:[…]}` / `{watchers:[…]}`). */
router.put('/api/channels/:adapterId/:convId/access', async (req, res) => {
  try {
    forHost(req);
    const list = listOf(req.body, 'access');
    if (list === undefined) return bad(res, 400, 'access is required (a list of {principal, authority}; [] removes everyone)', { code: 'bad-request' });
    answer(res, await engine().setAccess(req.params.adapterId, { kind: 'conversation', convId: req.params.convId }, list, { base: req.body.base }));
  } catch (e) { fail(res, e); }
});
router.put('/api/channels/:adapterId/:convId/watchers', async (req, res) => {
  try {
    forHost(req);
    const list = listOf(req.body, 'watchers');
    if (list === undefined) return bad(res, 400, 'watchers is required (a list; [] notifies nobody)', { code: 'bad-request' });
    answer(res, await engine().setWatchers(req.params.adapterId, { kind: 'conversation', convId: req.params.convId }, list, { base: req.body.base }));
  } catch (e) { fail(res, e); }
});
/** FILTER — `{filter:{match, rules[]}}` or `{filter:null}`; `estimate` may
 *  ride along and is stored on the filter as `estimateAtSet`. */
router.put('/api/channels/:adapterId/:convId/filter', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    if (!('filter' in b)) return bad(res, 400, 'filter is required (an object, or null to clear)', { code: 'bad-request' });
    answer(res, await engine().setFilter(req.params.adapterId, req.params.convId, b.filter, { estimate: b.estimate || null }));
  } catch (e) { fail(res, e); }
});
/** ESTIMATE — `{filter}` (or `{filter:null}` = all messages) over the stored
 *  history, SERVER-SIDE; answers `{estimate:{matched, total, matchedPerDay,
 *  totalPerDay, windowDays, sampled, truncated}}`. The client never sees the
 *  corpus (§10.2). */
router.post('/api/channels/:adapterId/:convId/estimate', (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    answer(res, engine().estimateFilter(req.params.adapterId, req.params.convId, 'filter' in b ? b.filter : null));
  } catch (e) { fail(res, e); }
});

/** THE RULE PREVIEW over ONE conversation (lane notify-rules-r2): `{rule}` → as the account route, scoped to it. */
router.post('/api/channels/:adapterId/:convId/rules/preview', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, RULE_PREVIEW_IS_OWNERS)) return;
    const b = req.body || {};
    answer(res, await engine().previewRule(req.params.adapterId, { kind: 'conversation' }, { rule: b.rule || null, convId: req.params.convId }));
  } catch (e) { fail(res, e); }
});

// ── P3: outbox / policy / reach (design §8, §9, §10.2) ───────────────────
/** A P3 verb's typed answer → status BY CODE. `send-not-available` is 409
 *  (the conversation cannot take a message right now — the reason rides
 *  `error`), `bad-state` 409, `not-found` 404, malformed input 400. */
function answer3(res, r) {
  if (r && r.ok) return res.json(r);
  const code = (r && r.code) || 'error';
  const status = code === 'not-found' ? 404
    : code === 'send-not-available' || code === 'bad-state' || code === 'reconcile-not-available' || code === 'wake-count-mismatch' || code === 'changed-since-shown' || code === 'topic-forbidden' || code === 'placement-not-offered' ? 409
    : code === 'rate-floor' ? 429
    : code === 'bad-proposal' || code === 'bad-policy' || code === 'bad-grant' || code === 'bad-request' ? 400
    : code === 'failed' || code === 'unknown' ? 502 : 500;
  return res.status(status).json({ ...(r && typeof r === 'object' ? r : {}), error: (r && r.error) || 'refused', code });
}
/** The OUTBOX — every proposal (newest first, bounded), optionally ONE
 *  conversation's (`?conv=<adapterId>/<convId>`). What both approval surfaces
 *  render (§9.2: one store, two places). */
router.get('/api/channels/outbox', (req, res) => {
  try {
    forHost(req);
    const key = req.query.conv ? String(req.query.conv) : null;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    res.json(engine().outboxView({ key, limit }));
  } catch (e) { fail(res, e); }
});
/** The USER's own draft from the composer: a proposal drafted by the user
 *  (authority `send`), judged by the same policy + guards as an agent's.
 *  WAKE GUARDS (r3, every wake-capable owner route — test-architecture §49):
 *  where the send STARTS A TURN (the adapter's `sendStartsTurn`) and goes out
 *  now, `expectWakes` must echo it (`409 wake-count-mismatch`) and, auth off,
 *  the owner's pace applies (`429 rate-floor`, nothing created). */
router.post('/api/channels/:adapterId/:convId/propose', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    answer3(res, await engine().propose({ kind: 'user' }, req.params.adapterId, req.params.convId, { text: b.text, replyTo: b.replyTo, why: b.why, attachments: b.attachments, ...(b.inThread !== undefined ? { inThread: b.inThread } : {}), ...(b.placement !== undefined ? { placement: b.placement } : {}), ...(b.replyAll !== undefined ? { replyAll: b.replyAll } : {}) }, wakeGuards(b)));
  } catch (e) { fail(res, e); }
});
/** THE OWNER'S OWN MESSAGE (design §22, 2.369.159): the composer's Send on
 *  a conversation that offers send-as-user — out at once as the user, no
 *  policy, no approval card (the IM rule: propose/approve is for AGENT
 *  drafts). Same answer shape as /propose; `409 send-not-available` + `why`
 *  when sending as the user is not offered here. Lane owner-composer-attach: it carries the owner's
 *  files (`attachments`, the agents' shape) and refuses an agent's bearer first (an agent drafts). */
router.post('/api/channels/:adapterId/:convId/send', async (req, res) => {
  try {
    forHost(req);
    if (refuseAgentBearer(req, res, OWN_SEND_IS_OWNERS)) return;
    const b = req.body || {};
    answer3(res, await engine().propose({ kind: 'user' }, req.params.adapterId, req.params.convId, { direct: true, text: b.text, replyTo: b.replyTo, attachments: b.attachments, ...(b.inThread !== undefined ? { inThread: b.inThread } : {}), ...(b.placement !== undefined ? { placement: b.placement } : {}), ...(b.replyAll !== undefined ? { replyAll: b.replyAll } : {}) }, wakeGuards(b)));
  } catch (e) { fail(res, e); }
});
/** APPROVE (`{text?}` = approve with an edit) — the unconditional convCaps
 *  re-resolution happens inside; a refusal answers 409 `send-not-available`
 *  with the adapter's own reason and the proposal is `failed`. A proposal
 *  whose send starts a turn (the card's `wakes`) needs `expectWakes` (`409
 *  wake-count-mismatch`) and, auth off, is paced (`429 rate-floor`) — both
 *  refusals leave the proposal AWAITING (r3). */
// 2026-09-27 (owner ruling: the delivery choice sits ON the action): `deliver`
// = how the drafting agent hears of the decision — `next-turn` (free, the
// default: with its next message) or `wake-now` (a billed turn now, counted
// in the `expectWakes` echo; paced like any owner wake when sign-in is off).
// Any other value is refused by name — never read as one of the two.
const RECEIPT_DELIVERIES = require('../channel-policy.js').RECEIPT_DELIVERIES;
function deliverOf(b) {
  if (b.deliver === undefined || b.deliver === null || b.deliver === '') return { ok: true, deliver: null };
  if (RECEIPT_DELIVERIES.includes(b.deliver)) return { ok: true, deliver: b.deliver };
  return { ok: false, code: 'bad-request', error: `deliver must be ${RECEIPT_DELIVERIES.join(' | ')}` };
}
// r6 verify F6 (2026-09-28, "what you approve is what runs"): `shown` = the PURE digest
// (channel-policy `shownDigest`) of the record the card was drawn from — REQUIRED; the
// engine refuses a proposal that is no longer that record (`409 changed-since-shown`,
// nothing sent). A request without it (a tab from before this rule) is refused by name.
router.post('/api/channels/outbox/:id/approve', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    const d = deliverOf(b);
    if (!d.ok) return answer3(res, d);
    if (typeof b.shown !== 'string' || !b.shown) return answer3(res, { ok: false, code: 'bad-request', why: 'shown-required', error: 'shown is required — the digest of the card being approved (reload the page if this tab is from before the update)' });
    answer3(res, await engine().approve(req.params.id, { text: typeof b.text === 'string' ? b.text : null, by: 'user', deliver: d.deliver, shown: b.shown, withoutFiles: b.withoutFiles === true, ...wakeGuards(b) }));
  } catch (e) { fail(res, e); }
});
router.post('/api/channels/outbox/:id/reject', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    const d = deliverOf(b);
    if (!d.ok) return answer3(res, d);
    answer3(res, await engine().reject(req.params.id, { reason: b.reason ? String(b.reason) : null, by: 'user', deliver: d.deliver, ...wakeGuards(b) }));
  } catch (e) { fail(res, e); }
});
/** RECONCILE (§9.4, P4): a PERSON asks whether a LOST send landed — the only
 *  way out of `unknown`, never a timer. `{ok:true, resolved, state, answer,
 *  reason?, proposal}` (resolved:false = still unknown, the ask counted); 409
 *  `reconcile-not-available` on an adapter whose declared idempotency cannot
 *  answer; 409 `bad-state` on anything but an unknown proposal. */
router.post('/api/channels/outbox/:id/reconcile', async (req, res) => {
  try {
    forHost(req);
    answer3(res, await engine().reconcile(req.params.id, { by: 'user' }));
  } catch (e) { fail(res, e); }
});
/** POLICY — `{mode:'direct'|'review'|null}` (null = the adapter's default). */
router.put('/api/channels/:adapterId/:convId/policy', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    if (!('mode' in b)) return bad(res, 400, 'mode is required (direct | review | null)', { code: 'bad-request' });
    answer3(res, await engine().setPolicy(req.params.adapterId, req.params.convId, b.mode === null ? null : String(b.mode), 'user'));
  } catch (e) { fail(res, e); }
});
/** REACH — `{principal:{kind,id,name?}, level:'hidden'|'requestable'|'visible'|null}`
 *  writes (or with `null` removes) the USER-origin grant for that principal
 *  on this conversation; the assignment's and a request's rows are separate. */
router.put('/api/channels/:adapterId/:convId/reach', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    if (!b.principal || typeof b.principal !== 'object') return bad(res, 400, 'principal is required ({kind:"agent"|"group", id})', { code: 'bad-request' });
    answer3(res, await engine().setReach(req.params.adapterId, req.params.convId, { principal: b.principal, level: b.level === undefined ? null : b.level }, 'user'));
  } catch (e) { fail(res, e); }
});
/** An agent's access REQUEST decided: approve = EXACTLY ONE visible grant. */
router.post('/api/channels/reach-requests/:id/:verdict', async (req, res) => {
  try {
    forHost(req);
    const v = req.params.verdict;
    if (v !== 'approve' && v !== 'deny') return bad(res, 400, 'verdict must be approve or deny', { code: 'bad-request' });
    answer3(res, await engine().decideRequest(req.params.id, v === 'approve', 'user'));
  } catch (e) { fail(res, e); }
});

// ── AGENT GROUPS, the owner's side (design §22.5). A distinct prefix on
// purpose: `/api/channels/:adapterId/:convId` would swallow `groups/<id>`.
// The owner is the implicit member of every group (`by: 'user'`); every verb
// answers the engine's typed refusal by code, every change broadcasts
// `channel-groups-updated` from the engine's one announce point. ──
function groupsEngine() {
  const g = ctx && ctx.getGroups && ctx.getGroups();
  if (!g) { const err = new Error('Agent groups are not available on this instance'); err.status = 503; err.code = 'unavailable'; throw err; }
  return g;
}
const OWNER = 'user';
const { consentVerdict } = require('../channel-groups.js');
/** THE OWNER'S CONSENT ECHO (r2): the panel sends the number of wakes it
 *  PREVIEWED (`expectWakes` — "will wake N" said before the click); the engine
 *  counts the wakes the act would cause inside its door and refuses
 *  `wake-count-mismatch` on any other number (a missing echo is 0). So the
 *  route that wakes agents signed "User" is never reached by a caller that
 *  did not first know — and say — what it costs. */
const ownerConsent = (b) => (n) => consentVerdict(n, { expect: Number.isInteger(b && b.expectWakes) ? b.expectWakes : 0 });
/** With auth OFF the owner cannot be told apart from a local agent's curl:
 *  the owner's routes are then PACED exactly like an agent (the engine's
 *  pacer — one wake per target per 30 s, 8 per minute). With auth on, a
 *  cookie proved the owner and the owner's own act is not paced. A missing
 *  switch counts as OFF (fail closed). */
const authOn = () => !!(ctx && typeof ctx.authEnabled === 'function' && ctx.authEnabled());
function ownerPacer(ge) {
  return authOn() || typeof ge.pacerFor !== 'function' ? null : ge.pacerFor(OWNER);
}
/** THE WAKE GUARDS of every OTHER owner route that can start a billed turn
 *  (r3 — the Channels composer's /send and /propose and the outbox /approve:
 *  the built-in Agents adapter's send IS a wake through the delivery
 *  ladder). The same two as the group routes: the consent echo always, and —
 *  auth off — THE SAME pacer (the groups engine's persisted ledger keyed
 *  `user|<conversation>`, so a target the group route just woke is floored
 *  here too). No groups engine with auth off ⇒ a pacer that refuses by name
 *  (fail closed). The channels engine applies them only where the adapter
 *  DECLARES its send starts a turn (`sendStartsTurn`), never by its id. */
function wakeGuards(b) {
  const ge = ctx && ctx.getGroups && ctx.getGroups();
  let mayWake = null;
  if (!authOn()) mayWake = ge && typeof ge.pacerFor === 'function' ? ge.pacerFor(OWNER) : () => ({ reason: 'the wake pace is not available on this instance — turn on sign-in, or retry once agent groups are available', why: 'no-pacer' });
  return { consent: ownerConsent(b), mayWake };
}
function groupReply(res, r) {
  if (r && r.ok) return res.json(r);
  const code = (r && r.code) || 'error';
  const status = code === 'not-found' || code === 'unreachable' ? 404 : code === 'not-allowed' || code === 'not-member' ? 403 : code === 'archived' || code === 'pair-group' || code === 'wake-count-mismatch' ? 409 : 400;
  // r3: a wake-count-mismatch carries the group view the server counted
  // against, so the panel repaints before its next click
  return res.status(status).json({ error: (r && r.error) || 'refused', code, ...(r && Number.isFinite(r.wakes) ? { wakes: r.wakes } : {}), ...(r && r.group && (code === 'wake-count-mismatch' || code === 'unknown-mention' || code === 'ambiguous-mention') ? { group: r.group } : {}), ...(r && (code === 'unknown-mention' || code === 'ambiguous-mention') ? { token: r.token || '', candidates: r.candidates || [] } : {}) });
}
router.get('/api/channel-groups', (req, res) => {
  try { forHost(req); res.json({ groups: groupsEngine().list() }); } catch (e) { fail(res, e); }
});
/** The live agent sessions the owner may add to a group (New group /
 *  Invite…): `{sessions:[{cid, name, groups}]}` — structure, the dialog words it. */
router.get('/api/channel-groups/roster', (req, res) => {
  try { forHost(req); res.json({ sessions: groupsEngine().liveRoster() }); } catch (e) { fail(res, e); }
});
router.get('/api/channel-groups/:id/messages', (req, res) => {
  try {
    forHost(req);
    const before = req.query.before !== undefined && req.query.before !== '' ? Number(req.query.before) : null;
    groupReply(res, groupsEngine().read({ by: OWNER, group: req.params.id, before, limit: Number(req.query.limit) || 50 }));
  } catch (e) { fail(res, e); }
});
router.post('/api/channel-groups', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    const ge = groupsEngine();
    groupReply(res, await ge.create({ by: OWNER, name: b.name, members: Array.isArray(b.members) ? b.members.map(String) : [], context: b.context || '', quiet: b.quiet === true, consent: ownerConsent(b), mayWake: ownerPacer(ge) }));
  } catch (e) { fail(res, e); }
});
router.post('/api/channel-groups/:id/:verb', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    const ge = groupsEngine();
    const group = req.params.id;
    let r;
    switch (req.params.verb) {
      case 'post': r = await ge.post({ group, from: OWNER, text: b.text, wake: b.wake === true, consent: ownerConsent(b), mayWake: ownerPacer(ge), mentions: Array.isArray(b.mentions) ? b.mentions.slice(0, 64) : [] }); break;   // B-ff04: the @-picker's places, by id   // the owner's own words go DIRECTLY (§22.5), never through the outbox
      case 'invite': r = await ge.invite({ by: OWNER, group, members: Array.isArray(b.members) ? b.members.map(String) : [], context: b.context || '', quiet: b.quiet === true, consent: ownerConsent(b), mayWake: ownerPacer(ge) }); break;
      case 'kick': r = await ge.kick({ by: OWNER, group, member: b.member }); break;
      case 'rename': r = await ge.rename({ by: OWNER, group, name: b.name }); break;
      case 'archive': r = await ge.archive({ by: OWNER, group }); break;
      case 'notify': r = await ge.setNotify({ by: OWNER, group, member: b.member, notify: b.notify }); break;   // the owner may set ANY member's mode
      case 'read': r = await ge.markRead({ group }); break;   // g3: the owner opened/touched the group's window — a USER act, never a repaint
      default: return bad(res, 404, `no group verb "${req.params.verb}"`, { code: 'bad-request' });
    }
    groupReply(res, r);
  } catch (e) { fail(res, e); }
});

module.exports = { router, setup };
