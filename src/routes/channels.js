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
const express = require('express');
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

const bad = (res, code, error, extra = {}) => res.status(code).json({ error, ...extra });

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
function choiceOf(b) {
  const out = {};
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
router.post('/api/channels/oauth/start', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    res.json({ ok: true, ...(await engine().startOAuth({ kind: typeof b.kind === 'string' ? b.kind : (typeof b.backend === 'string' ? b.backend : ''), ...choiceOf(b), options: b.options })) });
  } catch (e) { fail(res, e); }
});
router.get('/api/channels/oauth/status', (req, res) => {
  try { forHost(req); res.json(engine().oauthStatus(typeof req.query.flowId === 'string' ? req.query.flowId : null)); } catch (e) { fail(res, e); }
});
router.post('/api/channels/oauth/callback', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    const r = await engine().oauthCallback({ url: b.url, flowId: typeof b.flowId === 'string' ? b.flowId : null });
    if (!r.ok) return bad(res, 400, r.error || 'the consent flow failed', { code: 'auth-failed' });
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
    res.json(await engine().reauthorize(req.params.id, choiceOf(req.body || {})));
  } catch (e) { fail(res, e); }
});
/** DUPLICATE (r4 §8.1 #2): `{name?}` → `{adapter}` — a NEW, UNAUTHORIZED
 *  account carrying exactly the engine's declared `DUPLICATE_FIELDS`; the
 *  client then runs its own consent (reauthorize). */
router.post('/api/channels/adapters/:id/duplicate', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    res.json(await engine().duplicate(req.params.id, { name: typeof b.name === 'string' ? b.name : null }));
  } catch (e) { fail(res, e); }
});
/** REMOVE (r4 §8.1 #5): `409 account-referenced {detail.refs:[{kind:
 *  'assignment'|'reach'|'outbox', …}]}` BY NAME while anything points at the
 *  account; otherwise the record and its index rows go. Disconnect is not
 *  this verb (it only drops the token). */
router.delete('/api/channels/adapters/:id', async (req, res) => {
  try { forHost(req); res.json(await engine().remove(req.params.id)); } catch (e) { fail(res, e); }
});
/** THE OWNER'S CONFIG (D3 — the storage `GET /api/mounts/:id/config` rule):
 *  every parameter the Edit dialog prefills, the custom client's secret in
 *  the clear. Cookie-auth only, never broadcast, never logged, never an
 *  agent route (the agent surface is /api/agent/channels/* and does not
 *  reach this). */
router.get('/api/channels/adapters/:id/config', (req, res) => {
  try { forHost(req); res.json({ config: engine().adapterConfig(req.params.id) }); } catch (e) { fail(res, e); }
});
/** PASTE-BACK: the user pastes the redirect URL their browser landed on. */
router.post('/api/channels/adapters/:id/auth/finish', async (req, res) => {
  try {
    forHost(req);
    const url = req.body && req.body.url;
    if (!url || typeof url !== 'string') return bad(res, 400, 'url is required (the redirect URL your browser landed on)', { code: 'bad-request' });
    const r = await engine().finishAuth(req.params.id, url);
    if (!r.ok) return bad(res, 400, r.error || 'the consent flow failed', { code: 'auth-failed' });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});
router.post('/api/channels/adapters/:id/auth/cancel', async (req, res) => {
  try { forHost(req); res.json(await engine().cancelAuth(req.params.id)); } catch (e) { fail(res, e); }
});
router.post('/api/channels/adapters/:id/disconnect', async (req, res) => {
  try { forHost(req); res.json(await engine().disconnect(req.params.id)); } catch (e) { fail(res, e); }
});
/** ENABLE / OPTIONS / PUSH: `{enabled?}`, `{options:{…}}` (an option the
 *  adapter did not declare is refused by name) and/or `{push:{enabled?,
 *  claimedExclusive?}}` (P1b, design §6.4: the push switch and the
 *  exclusivity DECLARATION — a re-declaration clears a demotion and retries
 *  the lane once; `400 no-push-lane` on an adapter without one). */
router.put('/api/channels/adapters/:id', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    let out = { ok: true };
    if (typeof b.enabled === 'boolean') out = { ...out, ...(await engine().setEnabled(req.params.id, b.enabled)) };
    if (b.options !== undefined) out = { ...out, ...(await engine().setOptions(req.params.id, b.options)) };
    if (b.push !== undefined) out = { ...out, ...(await engine().setPush(req.params.id, b.push)) };
    // P4 (§9.5): the per-channel sender honesty switch — true / false / null
    // (= follow the instance setting `channels.senderHonestyLine`).
    if (b.senderHonestyLine !== undefined) out = { ...out, ...(await engine().setSenderHonesty(req.params.id, b.senderHonestyLine)) };
    // r4 (the Edit dialog's in-place saves): the account's name, and a custom
    // client's SECRET for the SAME id (another id / a preset = a client
    // switch = `409 client-change-needs-reauth`: use Re-authorize)
    if (typeof b.label === 'string') out = { ...out, ...(await engine().setLabel(req.params.id, b.label)) };
    if (b.credential && typeof b.credential === 'object' && !Array.isArray(b.credential)) out = { ...out, ...(await engine().setCustomSecret(req.params.id, { appId: b.credential.appId, appSecret: b.credential.appSecret })) };
    res.json(out);
  } catch (e) { fail(res, e); }
});

/** LIST — the whole panel in one read. */
router.get('/api/channels', (req, res) => {
  try { forHost(req); res.json(engine().digest()); } catch (e) { fail(res, e); }
});

/** OPEN — one conversation's summary (what the window's context bar shows). */
router.get('/api/channels/:adapterId/:convId', (req, res) => {
  try {
    forHost(req);
    const d = engine().digest();
    const key = `${req.params.adapterId}/${req.params.convId}`;
    const conv = d.conversations.find((c) => c.key === key);
    if (!conv) return bad(res, 404, 'No such conversation');
    const adapter = d.adapters.find((a) => a.id === conv.adapterId) || null;
    res.json({ conversation: conv, adapter });
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
router.get('/api/channels/:adapterId/:convId/messages', (req, res) => {
  try {
    forHost(req);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const before = req.query.before ? Number(req.query.before) : null;
    const beforeId = req.query.beforeId ? String(req.query.beforeId) : null;
    const records = engine().messages(req.params.adapterId, req.params.convId, { before, beforeId, limit });
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

/** TRACK — the opt-in that decides whether anything is ingested at all
 *  (§5 invariant 6). Without it the panel could never show a message, so it
 *  ships with the panel rather than with the adapters. */
router.post('/api/channels/:adapterId/:convId/track', async (req, res) => {
  try {
    forHost(req);
    const tracked = !(req.body && req.body.tracked === false);
    const ok = await engine().setTracked(req.params.adapterId, req.params.convId, tracked);
    if (!ok) return bad(res, 404, 'No such conversation');
    res.json({ ok: true, tracked });
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
  const status = code === 'not-found' ? 404 : code === 'authority-capped' ? 409 : code === 'no-such-filter' || code === 'filter-in-use' || code === 'bad-filter' || code === 'bad-assignment' ? 400 : 500;
  return res.status(status).json({ error: (r && r.error) || 'refused', code });
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

// ── P3: outbox / policy / reach (design §8, §9, §10.2) ───────────────────
/** A P3 verb's typed answer → status BY CODE. `send-not-available` is 409
 *  (the conversation cannot take a message right now — the reason rides
 *  `error`), `bad-state` 409, `not-found` 404, malformed input 400. */
function answer3(res, r) {
  if (r && r.ok) return res.json(r);
  const code = (r && r.code) || 'error';
  const status = code === 'not-found' ? 404
    : code === 'send-not-available' || code === 'bad-state' || code === 'reconcile-not-available' || code === 'wake-count-mismatch' ? 409
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
    answer3(res, await engine().propose({ kind: 'user' }, req.params.adapterId, req.params.convId, { text: b.text, replyTo: b.replyTo, why: b.why, attachments: b.attachments }, wakeGuards(b)));
  } catch (e) { fail(res, e); }
});
/** THE OWNER'S OWN MESSAGE (design §22, 2.369.159): the composer's Send on
 *  a conversation that offers send-as-user — out at once as the user, no
 *  policy, no approval card (the IM rule: propose/approve is for AGENT
 *  drafts). Same answer shape as /propose; `409 send-not-available` + `why`
 *  when sending as the user is not offered here. */
router.post('/api/channels/:adapterId/:convId/send', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    answer3(res, await engine().propose({ kind: 'user' }, req.params.adapterId, req.params.convId, { text: b.text, replyTo: b.replyTo, attachments: b.attachments, direct: true }, wakeGuards(b)));
  } catch (e) { fail(res, e); }
});
/** APPROVE (`{text?}` = approve with an edit) — the unconditional convCaps
 *  re-resolution happens inside; a refusal answers 409 `send-not-available`
 *  with the adapter's own reason and the proposal is `failed`. A proposal
 *  whose send starts a turn (the card's `wakes`) needs `expectWakes` (`409
 *  wake-count-mismatch`) and, auth off, is paced (`429 rate-floor`) — both
 *  refusals leave the proposal AWAITING (r3). */
router.post('/api/channels/outbox/:id/approve', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    answer3(res, await engine().approve(req.params.id, { text: typeof b.text === 'string' ? b.text : null, by: 'user', ...wakeGuards(b) }));
  } catch (e) { fail(res, e); }
});
router.post('/api/channels/outbox/:id/reject', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    answer3(res, await engine().reject(req.params.id, { reason: b.reason ? String(b.reason) : null, by: 'user' }));
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
  return res.status(status).json({ error: (r && r.error) || 'refused', code, ...(r && Number.isFinite(r.wakes) ? { wakes: r.wakes } : {}), ...(r && r.group && code === 'wake-count-mismatch' ? { group: r.group } : {}) });
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
      case 'post': r = await ge.post({ group, from: OWNER, text: b.text, wake: b.wake === true, consent: ownerConsent(b), mayWake: ownerPacer(ge) }); break;   // the owner's own words go DIRECTLY (§22.5), never through the outbox
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
