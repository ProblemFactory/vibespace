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
 *   POST /api/providers/:id/models/refresh
 *       → { ok, provider, listed, skipped } | the refusal { code, error } (403 an agent's token or another site · 404 ·
 *         409 not listed / in flight / no key · 423 the vault locked · 429 once a minute, Retry-After · 502 the provider)
 *         — A PERSON'S PRESS ONLY: the one caller of refreshListedModels (test-vendor-whitelist §13 pins it).
 */
const MP = require('../model-providers.js');
const { personVerdict } = require('./vault.js');

const STATUS = Object.freeze({ human_only: 403, cross_site: 403, unknown: 404, 'not-listed': 409, 'in-flight': 409, 'key-unreadable': 409, vault_not_set_up: 409, vault_locked: 423, cooldown: 429, unreachable: 502, http: 502, 'too-large': 502, 'bad-answer': 502, invalid: 502 });
// the record as a menu shows it: its rows and words — never where its key lives
const brief = (p) => (p ? { id: p.id, kind: p.kind, label: p.label, preset: p.preset, models: p.models, defaultModel: p.defaultModel, aliases: p.aliases, modelsSource: p.modelsSource, listedBy: p.listedBy, fetchedAt: p.fetchedAt } : null);

function registerProviderModelRoutes(app, { accounts, providers, activeSessions, catalogOf = () => null, refreshModels = () => { }, refresher }) {
  const acctGet = (id) => { try { return id && accounts && typeof accounts.get === 'function' ? accounts.get(id) : null; } catch { return null; } };
  const menu = (backend, account) => {
    const provider = account ? providers.forAccount(account) : providers.forAccount({ backend });
    const m = MP.menuOf(provider, catalogOf(backend));
    return {
      backend,
      account: account && account.id ? { id: account.id, name: account.name || account.id, type: account.type || 'api' } : null,
      provider: brief(provider), models: m.models, empty: m.empty, open: m.open, defaultId: m.defaultId, refreshable: MP.refreshable(provider),
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
  app.get('/api/available-models', (req, res, next) => {
    const q = req.query || {};
    if (q.session === undefined && q.account === undefined) return next();
    try { refreshModels(); } catch { }
    if (q.session !== undefined) {
      const s = activeSessions && typeof activeSessions.get === 'function' ? activeSessions.get(String(q.session)) : null;
      if (!s) return res.status(404).json({ error: 'no such running session', code: 'unknown' });
      const backend = String(s.backend || 'claude');
      return res.json({ session: String(q.session), ...menu(backend, accountOfSession(s) || { backend }) });
    }
    const backend = String(q.backend || 'claude');
    const id = String(q.account || '');
    if (!id || id === 'subscription') return res.json(menu(backend, null));
    const a = acctGet(id) || (/^pv-/.test(id) && providers.get(id) ? { id, backend, type: 'provider', name: providers.get(id).label } : null);
    if (!a) return res.status(404).json({ error: 'unknown account', code: 'unknown' });
    res.json(menu(backend, a));
  });
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
