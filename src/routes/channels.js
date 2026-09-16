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
  return res.status(status || 500).json({ error: String((e && e.message) || e), code, detail: detail && typeof detail === 'object' ? { missing: detail.missing || undefined, needsCredentials: detail.needsCredentials || undefined, code: detail.code || undefined } : null });
}

// ── P1: connect / re-authorize / paste-back / cancel / disconnect / options ──
/** CONNECT (or RE-AUTHORIZE): begins the adapter's consent flow, creating
 *  the record on first connect. `409 needs-credentials` when the row's
 *  integration resolves to none — the client opens that card FIRST. */
router.post('/api/channels/adapters/:kind/connect', async (req, res) => {
  try { forHost(req); res.json(await engine().connect(req.params.kind)); } catch (e) { fail(res, e); }
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
    : code === 'send-not-available' || code === 'bad-state' || code === 'reconcile-not-available' ? 409
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
 *  (authority `send`), judged by the same policy + guards as an agent's. */
router.post('/api/channels/:adapterId/:convId/propose', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    answer3(res, await engine().propose({ kind: 'user' }, req.params.adapterId, req.params.convId, { text: b.text, replyTo: b.replyTo, why: b.why, attachments: b.attachments }));
  } catch (e) { fail(res, e); }
});
/** APPROVE (`{text?}` = approve with an edit) — the unconditional convCaps
 *  re-resolution happens inside; a refusal answers 409 `send-not-available`
 *  with the adapter's own reason and the proposal is `failed`. */
router.post('/api/channels/outbox/:id/approve', async (req, res) => {
  try {
    forHost(req);
    const b = req.body || {};
    answer3(res, await engine().approve(req.params.id, { text: typeof b.text === 'string' ? b.text : null, by: 'user' }));
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

module.exports = { router, setup };
