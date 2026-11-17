'use strict';
/**
 * THE THIRD-PARTY MODEL PROVIDERS (lane lg-providers, B-d578 U1 — design q-045 §2.4 / §3 + q-053 Train 2): the wizard's
 * doors. Thin: the store (src/server/provider-store.js) keeps and seals, the PURE rules (src/model-providers.js SHIPPED ·
 * fits · validateKey · draftOf) decide; a route decides nothing.
 *
 *   GET    /api/providers
 *       → { shipped: [<preset> + fits], shippedAt, providers: [<record> + fits] } — the presets the wizard offers and the
 *         records kept; a record never carries its key, nor where the vault keeps it (only the last four characters, `tail`);
 *         a page's read — any Bearer (an agent) ⇒ 403 human_only; never cached (no-store)
 *   POST   /api/providers          { preset, key, region?, baseUrl?, label?, model?, wire? }
 *       → 201 { ok, provider } | 400 { code: 'invalid', errors: [{ field, code }] } | 423 vault_locked | 409 vault_not_set_up
 *   POST   /api/providers/:id/key  { key }           → { ok, provider } (a new key sealed over the old) | 400 · 404 · 423 · 409
 *   PATCH  /api/providers/:id      { label?, defaultModel?, baseUrl? + wire? + key } → { ok, provider } | 400 · 404 — a new
 *         address (a self-hosted one only) is taken only with the key pasted again (`base-url-fixed` elsewhere)
 *   DELETE /api/providers/:id      → { ok, id, keyDropped, orphan? } (the record, then its vault entry; an entry whose record
 *         is gone is dropped too — the Vault row's Remove is this door) | 404
 *
 * EVERY WRITE IS A PERSON'S (personVerdict: any Bearer — an agent's session token, a job's, an automation key — ⇒ 403
 * `human_only`; another site ⇒ 403 `cross_site`): the owner adds a provider and pastes its key; an agent never can. Each
 * write broadcasts `providers-changed` and re-announces the account lists (a provider shows on the rosters it fits).
 */
const MP = require('../model-providers.js');
const { personVerdict } = require('./vault.js');
const anyBearer = (req) => /^Bearer\s+\S/i.test(String((req.headers && req.headers.authorization) || ''));

const STATUS = Object.freeze({ invalid: 400, unknown: 404, 'built-in': 409, vault_locked: 423, vault_not_set_up: 409, 'key-unreadable': 409, 'write-failed': 500 });
const WORDS = Object.freeze({
  invalid: 'some fields are not valid', unknown: 'unknown provider', 'built-in': 'a built-in provider is not changed here',
  vault_locked: 'unlock the vault first — the provider’s key is kept there', vault_not_set_up: 'set up the vault first — the provider’s key is kept there',
  'key-unreadable': 'the vault could not keep the key', 'write-failed': 'the provider list could not be written',
});
/** a record as the page reads it — no key (there is none in it), not where the vault keeps it, + which harnesses it serves */
const pub = (p) => { if (!p) return null; const { keyRef, ...rest } = p; return { ...rest, hasKey: !!keyRef, fits: MP.fits(p) }; };
const shippedPub = (s) => ({ ...s, fits: MP.fits({ kind: s.kind }) });

function registerProviderRoutes(app, { providers, onChange = () => { } }) {
  const refuse = (res, r) => res.status(STATUS[r.code] || 400).json({ ok: false, code: r.code, error: WORDS[r.code] || r.code, ...(r.errors ? { errors: r.errors } : {}) });
  const person = (req, res) => {
    const who = personVerdict(req);
    if (who.ok) return true;
    res.status(403).json({ ok: false, code: who.code, error: 'only a person on this page adds or changes a model provider' });
    return false;
  };
  const changed = (what, id) => { try { onChange({ what, id }); } catch { } };
  app.use('/api/providers', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/providers', (req, res) => {
    if (anyBearer(req)) return res.status(403).json({ ok: false, code: 'human_only', error: 'the model providers are listed for a person\u2019s page only' });
    res.json({ shipped: MP.SHIPPED.map(shippedPub), shippedAt: MP.SHIPPED_AT, providers: providers.thirdParty().map(pub) });
  });
  app.post('/api/providers', (req, res) => {
    if (!person(req, res)) return;
    const b = req.body || {};
    const r = providers.add({ preset: b.preset, key: b.key, region: b.region, baseUrl: b.baseUrl, label: b.label, model: b.model, wire: b.wire });
    if (!r.ok) return refuse(res, r);
    changed('add', r.provider.id);
    res.status(201).json({ ok: true, provider: pub(r.provider) });
  });
  app.post('/api/providers/:id/key', (req, res) => {
    if (!person(req, res)) return;
    const r = providers.rekey(String(req.params.id), (req.body || {}).key);
    if (!r.ok) return refuse(res, r);
    changed('rekey', r.provider.id);
    res.json({ ok: true, provider: pub(r.provider) });
  });
  app.patch('/api/providers/:id', (req, res) => {
    if (!person(req, res)) return;
    const b = req.body || {};
    const r = providers.patch(String(req.params.id), { label: b.label, baseUrl: b.baseUrl, defaultModel: b.defaultModel, wire: b.wire, key: b.key });
    if (!r.ok) return refuse(res, r);
    changed('patch', r.provider.id);
    res.json({ ok: true, provider: pub(r.provider) });
  });
  app.delete('/api/providers/:id', (req, res) => {
    if (!person(req, res)) return;
    const r = providers.remove(String(req.params.id));
    if (!r.ok) return refuse(res, r);
    changed('remove', r.id);
    res.json({ ok: true, id: r.id, keyDropped: r.keyDropped, ...(r.orphan ? { orphan: true } : {}) });
  });
}

module.exports = { registerProviderRoutes };
