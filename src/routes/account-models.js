'use strict';
/**
 * THE ACCOUNT'S MODELS (design q-053 r1 §3, lane provider-record): the account dialog's model section reads and saves
 * through these two routes. Thin: the store (src/server/provider-store.js) keeps, the PURE rules (src/model-providers.js)
 * decide; a route decides nothing.
 *
 *   GET /api/accounts/:id/models
 *       → { account: { id, name, backend, type }, provider: <the record, rows filled>, editable }
 *         — `:id` is a roster account (its provider by accountProviderId) or a projected third-party row (`pv-…`, whose id
 *         IS its record's); 404 for neither; `provider: null` for an account of a harness with no provider table
 *   PUT /api/accounts/:id/models   { models: [{ id, label, context, caps }], aliases?, defaultModel? }
 *       → { ok: true, provider } | 400 { error, code: 'invalid', errors: [{ index?, field, code }] } (the dialog marks each
 *         field) | 409 { code: 'listed' } (the harness or the provider lists these rows) | 404 · 403 agent_forbidden
 *
 * HUMAN-TRIGGERED ONLY for the write: an agent's session / job token is refused (the reset-credit rule) — the owner enters
 * the models an account may use. The 「测试」 of a row is not here: it runs the roster's own Test with that row's id.
 */
const MP = require('../model-providers.js');   // refreshable — the dialog's Refresh decided off the whole record (the chain cure)
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));

function registerAccountModelRoutes(app, { accounts, providers }) {
  // the target: a roster account, or a projected third-party row (no account record yet: the wizard is Train 2)
  const targetOf = (id) => {
    const a = accounts && typeof accounts.get === 'function' ? accounts.get(id) : null;
    if (a) return { account: { id: a.id, name: a.name || a.id, backend: a.backend || 'claude', type: a.type || 'api' }, provider: providers.forAccount(a) };
    const p = /^pv-/.test(id) ? providers.get(id) : null;
    return p ? { account: { id: p.id, name: p.label, backend: null, type: 'provider' }, provider: p } : null;
  };
  // the dialog's rows and words — never where the vault keeps the key, the third party's address or the key's tail: a GET from
  // the person's own page on plain http carries neither Origin nor Sec-Fetch-Site, so this door cannot tell the person and
  // answers what anyone may read (the person's list of all three: POST /api/providers/list — lane lg-providers U1 cure (B))
  // …and what the dialog's Refresh button needs to decide, computed here off the WHOLE record (never the address itself)
  const answer = (t) => ({ account: t.account, provider: t.provider ? { ...(({ keyRef, baseUrl, tail, ...rest }) => rest)(t.provider), refreshable: MP.refreshable(t.provider) } : null, editable: !!t.provider && providers.editable(t.provider.id) });
  app.get('/api/accounts/:id/models', (req, res) => {
    const t = targetOf(String(req.params.id));
    if (!t) return res.status(404).json({ error: 'unknown account', code: 'unknown' });
    res.json(answer(t));
  });
  app.put('/api/accounts/:id/models', async (req, res) => { try {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'the owner enters an account\'s models — an agent cannot', code: 'agent_forbidden' });
    const t = targetOf(String(req.params.id));
    if (!t) return res.status(404).json({ error: 'unknown account', code: 'unknown' });
    if (!t.provider) return res.status(409).json({ error: 'this account has no model provider', code: 'no_provider' });
    const r = providers.setModels(t.provider.id, req.body || {});
    // a person's act is on disk before the answer (the store writer — lane lg-providers U1 cure (C)); a failed write stays owed
    // to the writer (it retries), so memory holds the rows: every page is told either way
    const kept = r.ok && typeof providers.durable === 'function' ? await providers.durable() : true;
    if (r.ok && /^pv-/.test(String(t.provider.id))) { try { if (typeof accounts.providersChanged === 'function') accounts.providersChanged(); } catch { } }   // lane lg-providers U5 r1: every page re-reads the provider's rows
    if (!kept) return res.status(500).json({ error: 'the models could not be written yet — the hub tries again', code: 'write-failed' });
    if (r.ok) return res.json({ ok: true, provider: answer({ account: t.account, provider: r.provider }).provider });   // the same shape the GET answers — never the address, the tail or the key's place (the chain cure's read, R8)
    if (r.code === 'invalid') return res.status(400).json({ error: 'some rows are not valid', code: 'invalid', errors: r.errors });
    return res.status(409).json({ error: 'these models are listed by the harness or the provider — they are not entered here', code: r.code });
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: 'the models could not be saved', code: 'failed' }); } });   // an async handler's throw never hangs the request (Express 4)
}

module.exports = { registerAccountModelRoutes };
