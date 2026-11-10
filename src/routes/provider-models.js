'use strict';
/**
 * MODELS AT A SESSION + THE LISTED-PROVIDER REFRESH DOOR (design q-053 r1 §3, lane models-at-session = Train 1 row P0c).
 * Thin: the store (src/server/provider-store.js) keeps, the PURE rules (src/model-providers.js menuOf · resolvePick ·
 * refreshVerdict) decide, the refresh's one request lives in src/server/provider-models.js.
 *
 *   GET /api/available-models?session=<id>
 *       → the RUNNING conversation's menu — the badge's list: its account's provider (a pooled conversation: the member it
 *         bills now; no account: its harness's own login)
 *   GET /api/available-models?backend=<harness>&account=<id>
 *       → a NEW conversation's menu for the account the dialog's row names ('' / 'subscription' = the machine's own login)
 *       → both: { backend, account: { id, name, type } | null, provider: <the record, no keyRef / baseUrl> | null,
 *                 models: [{ id, label, … }], empty, open, defaultId, refreshable }
 *       — no query ⇒ next(): server.js's whole-catalog answer, unchanged (Settings, the codex effort ladder)
 *       — a harness that REPORTS its models per account (the descriptor's `modelsReport`, antigravity's `agy models`; lane
 *         agy-models-report) answers `models` = what the CLI reported for THAT account (the key «machine» = the machine's own
 *         login), else the shipped rows, plus `report` { source: 'reported' | 'shipped', listedAt, lastError, listing,
 *         account, host, by }. A GET NEVER LISTS — not an attach, a page load or reload, the re-read after the door's own
 *         dirty push, a second client: it answers what is known, at once, and never waits on the vendor.
 *   POST /api/cli-models/open {backend, account} | {session}
 *       → THE OPENING (ruling E1): sent ONLY by the two OPEN handlers (the New Session model field opened, a chat's model menu
 *         opened) — asks src/server/cli-models-door.js to list under its floors → { ok, listing, code } (the decision, at once;
 *         the listing's end pushes `available-models-dirty`). A POST, not a GET parameter: a same-origin GET from a page on
 *         plain http carries neither Origin nor Sec-Fetch-Site, so only a POST lets personVerdict tell a person's page.
 *   POST /api/cli-models/refresh {backend, account}
 *       → the explicit «Refresh from …» row: the floors set aside, once a minute and at most 24 a day per account (both kept
 *         across a restart) — { ok, listing, code } | 403 · 404 · 429 throttled / daily-bound (Retry-After)
 *   POST /api/providers/:id/models/refresh
 *       → { ok, provider, listed, skipped } | the refusal { code, error } (403 an agent's token or another site · 404 ·
 *         409 not listed / in flight / no key · 423 the vault locked · 429 once a minute, Retry-After · 502 the provider)
 *         — A PERSON'S PRESS ONLY: the one caller of refreshListedModels (test-vendor-whitelist §13 pins it).
 */
const MP = require('../model-providers.js');
const CMC = require('../claude-model-catalog.js'); // PURE: remoteRows (another machine's menu)
const { personVerdict } = require('./vault.js');

const STATUS = Object.freeze({ human_only: 403, cross_site: 403, unknown: 404, 'not-listed': 409, 'in-flight': 409, 'key-unreadable': 409, vault_not_set_up: 409, vault_locked: 423, cooldown: 429, unreachable: 502, http: 502, 'too-large': 502, 'bad-answer': 502, invalid: 502 });
// the record as a menu shows it: its rows and words — never where its key lives
const brief = (p) => (p ? { id: p.id, kind: p.kind, label: p.label, preset: p.preset, models: p.models, defaultModel: p.defaultModel, aliases: p.aliases, modelsSource: p.modelsSource, listedBy: p.listedBy, fetchedAt: p.fetchedAt } : null);

function registerProviderModelRoutes(app, { accounts, providers, activeSessions, catalogOf = () => null, refreshModels = () => { }, refresher, modelsDoor = null, modelsMint = null }) {
  // the door's key for an account: a named one's id; none (or the machine's own login) = «machine»
  const keyOf = (account) => (account && account.id && account.type !== 'provider' && account.type !== 'pooled' ? account.id : 'machine');
  const reports = (backend) => !!(modelsDoor && modelsDoor.declares(backend));
  const acctGet = (id) => { try { return id && accounts && typeof accounts.get === 'function' ? accounts.get(id) : null; } catch { return null; } };
  const menu = (backend, account, host = null) => {
    const provider = account ? providers.forAccount(account) : providers.forAccount({ backend });
    // THE CLI'S OWN REPORT (lane agy-models-report): no provider record + a harness that reports ⇒ the rows its CLI reported
    // for THIS account, the Default row kept first; before any report (or for another machine) the shipped rows, and `report`
    // says which. Nothing derived is ever added (the owner's ruling, 2026-11-10: only what the vendor offers).
    const rep = !provider && !host && reports(backend) ? modelsDoor.report(backend, keyOf(account)) : null;
    const m = MP.menuOf(provider, rep && rep.rows ? [{ id: '', label: 'Default' }, ...rep.rows] : catalogOf(backend));
    const report = !provider && reports(backend)
      ? (host ? { source: 'shipped', host: String(host), listedAt: null, lastError: null, listing: false, account: keyOf(account), by: modelsDoor.report(backend, 'machine').by }
        : { source: rep && rep.rows ? 'reported' : 'shipped', listedAt: rep ? rep.listedAt : null, lastError: rep ? rep.lastError : null, listing: !!(rep && rep.listing), account: keyOf(account), by: rep.by })
      : undefined;
    return {
      backend,
      account: account && account.id ? { id: account.id, name: account.name || account.id, type: account.type || 'api' } : null,
      provider: brief(provider), models: host ? CMC.remoteRows(m.models) : m.models, empty: m.empty, open: m.open, defaultId: m.defaultId, refreshable: MP.refreshable(provider), // `host`: another machine — ONE parameter for every door
      ...(report ? { report } : {}),
    };
  };
  // the account a running conversation bills NOW: its own, or — pooled — the member it holds (accounts.poolMemberOfSession)
  const accountOfSession = (s) => {
    const a = acctGet(s._accountId);
    if (!a) return null;
    if (a.type !== 'pooled') return a;
    let m = null;
    try { m = acctGet(accounts.poolMemberOfSession(a.id, s, s._webuiId || null).id); } catch { }
    return m || a;
  };
  app.get('/api/available-models', async (req, res, next) => {
    const q = req.query || {};
    if (q.session === undefined && q.account === undefined) return next();
    if (modelsDoor) { try { await modelsDoor.ready(); } catch { } } // the cache's one async read (never a hold on the loop)
    try { refreshModels(); } catch { }
    if (q.session !== undefined) {
      const s = activeSessions && typeof activeSessions.get === 'function' ? activeSessions.get(String(q.session)) : null;
      if (!s) return res.status(404).json({ error: 'no such running session', code: 'unknown' });
      const backend = String(s.backend || 'claude');
      // PAIRED MACHINES (lane cli-update-needs-nothing): the conversation's machine is the `host` parameter (not a branch)
      return res.json({ session: String(q.session), ...menu(backend, accountOfSession(s) || { backend }, s.host || null) });
    }
    const backend = String(q.backend || 'claude');
    const id = String(q.account || '');
    const host = q.host ? String(q.host) : null; // the New Session dialog's machine when it is not this hub
    if (!id || id === 'subscription') return res.json(menu(backend, null, host));
    const a = acctGet(id) || (/^pv-/.test(id) && providers.get(id) ? { id, backend, type: 'provider', name: providers.get(id).label } : null);
    if (!a) return res.status(404).json({ error: 'unknown account', code: 'unknown' });
    res.json(menu(backend, a, host));
  });
  // THE CLI'S OWN LIST (lane agy-models-report) — two doors, a person's page only (an agent's bearer, another site: 403 by name):
  // the OPENING of a model menu (under the door's floors) and the explicit row «Refresh from …» (the floors set aside, once a
  // minute). The target is the menu's: a running conversation's account (`session`) or the dialog's (`backend` + `account`).
  const cliTarget = (b) => {
    if (b.session !== undefined) {
      const s = activeSessions && typeof activeSessions.get === 'function' ? activeSessions.get(String(b.session)) : null;
      if (!s) return { error: [404, 'unknown', 'no such running session'] };
      const backend = String(s.backend || 'claude');
      return { backend, account: accountOfSession(s) || { backend }, host: s.host || null }; // the conversation's machine: the ONE `host` parameter
    }
    const backend = String(b.backend || '');
    const id = String(b.account || '');
    const host = b.host ? String(b.host) : null;
    if (!id || id === 'subscription' || id === 'machine') return { backend, account: null, host };
    const a = acctGet(id);
    return a ? { backend, account: a, host } : { error: [404, 'unknown', 'unknown account'] };
  };
  const cliDoor = (kind) => async (req, res) => {
    // THE ONE PERSON GATE (round 2 law A, round 3 law 2): THIS registrar alone holds the mint (the door handed around cannot
    // mint); it runs personVerdict and binds the press to this menu — (backend, account, kind) — spent in this request
    const t = cliTarget(req.body || {});
    const m = modelsMint(req, t.error ? null : { backend: t.backend, account: keyOf(t.account), kind });
    if (!m.ok) return res.status(403).json({ ok: false, error: 'only a person on this page can ask a CLI for its models', code: m.code });
    if (t.error) return res.status(t.error[0]).json({ ok: false, code: t.error[1], error: t.error[2] });
    if (!reports(t.backend) || (t.account && providers.forAccount(t.account))) return res.status(400).json({ ok: false, code: 'no-report', error: 'this menu is not a CLI\u2019s own list' });
    // another machine's CLI is not read yet (R4 — the device op is deferred): its menu answers the shipped list and says so
    if (t.host) return res.status(409).json({ ok: false, code: 'other-machine', error: 'that machine\u2019s CLI is not read yet' });
    const r = await modelsDoor.ask(t.backend, keyOf(t.account), { press: m.press, kind });
    if (r.code === 'throttled' || r.code === 'daily-bound') res.set('Retry-After', String(Math.ceil((r.retryInMs || 0) / 1000)));
    res.status(r.status || (r.ok ? 200 : 400)).json(r);
  };
  app.post('/api/cli-models/open', cliDoor('open'));
  app.post('/api/cli-models/refresh', cliDoor('refresh'));
  app.post('/api/providers/:id/models/refresh', async (req, res) => {
    const who = personVerdict(req);
    if (!who.ok) return res.status(403).json({ error: 'only a person on this page can refresh a provider’s list', code: who.code });
    const r = await refresher.refreshListedModels(String(req.params.id), { by: 'human' });
    if (r.ok) return res.json({ ok: true, provider: r.provider, listed: r.listed, skipped: r.skipped, droppedAliases: r.droppedAliases });
    if (r.code === 'cooldown') res.set('Retry-After', String(Math.ceil((r.retryAfterMs || 0) / 1000)));
    const words = String(MP.REFRESH_WORDS[r.code] || r.code || 'error').replace('{s}', String(Math.ceil((r.retryAfterMs || 0) / 1000))).replace('{status}', String(r.status || ''));
    res.status(STATUS[r.code] || 400).json({ ...r, ok: false, error: words });
  });
}

module.exports = { registerProviderModelRoutes };
