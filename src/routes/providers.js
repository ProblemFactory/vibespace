'use strict';
/**
 * THE THIRD-PARTY MODEL PROVIDERS (lane lg-providers, B-d578 U1 — design q-045 §2.4 / §3 + q-053 Train 2): the wizard's
 * doors. Thin: the store (src/server/provider-store.js) keeps and seals, the PURE rules (src/model-providers.js SHIPPED ·
 * fits · validateKey · draftOf) decide; a route decides nothing.
 *
 *   POST   /api/providers/list
 *       → { shipped: [<preset> + fits], shippedAt, providers: [<record> + fits + hasKey + keyVars] } — the presets the wizard
 *         offers and the records kept; a record never carries its key, nor where the vault keeps it (only `tail` — the
 *         last four characters of a key of 20 or more); THE PERSON'S read, through personVerdict like every write (U1 cure
 *         (B): on an instance nobody signs in to, any other caller would read the labels, addresses and tails); never cached
 *   POST   /api/providers          { preset, key, region?, baseUrl?, label?, model?, wire? }
 *       → 201 { ok, provider } | 400 { code: 'invalid', errors: [{ field, code }] } | 423 vault_locked | 409 vault_not_set_up
 *   POST   /api/providers/:id/key  { key }           → { ok, provider } (a new key sealed over the old) | 400 · 404 · 423 · 409
 *   PATCH  /api/providers/:id      { label?, defaultModel?, baseUrl? + wire? + key } → { ok, provider } | 400 · 404 — a new
 *         address (a self-hosted one only) is taken only with the key pasted again (`base-url-fixed` elsewhere)
 *   POST   /api/providers/:id/test { harness } → { ok, harness, verdict, detail, at } — THE TEST (lane lg-providers U4,
 *         src/server/provider-test.js): the harness's own CLI says «ok» to the third party, once, in a child with empty homes;
 *         refused by name before anything spawns (403 human_only / cross_site · 404 unknown · 409 built-in / no-address /
 *         vendor-own / unfit / in-flight / no-key / key-unreadable / vault_not_set_up · 423 vault_locked); spends one short
 *         request of the person's own key — a person's press only, never a timer, never an agent
 *   DELETE /api/providers/:id      → { ok, id, keyDropped, orphan? } (the record, then its vault entry; an entry whose record
 *         is gone is dropped too — the Vault row's Remove is this door) | 404
 *
 * EVERY WRITE IS A PERSON'S (personVerdict: any Bearer — an agent's session token, a job's, an automation key — ⇒ 403
 * `human_only`; another site ⇒ 403 `cross_site`): the owner adds a provider and pastes its key; an agent never can. Each
 * write broadcasts `providers-changed` and re-announces the account lists (a provider shows on the rosters it fits).
 */
const MP = require('../model-providers.js');
const { personVerdict } = require('./vault.js');

const PT = require('../provider-test-model.js');
const STATUS = Object.freeze({ invalid: 400, unknown: 404, 'built-in': 409, vault_locked: 423, vault_not_set_up: 409, 'key-unreadable': 409, 'write-failed': 500,
  'no-address': 409, 'vendor-own': 409, unfit: 409, 'in-flight': 409, 'no-key': 409, failed: 500 });
const WORDS = Object.freeze({
  invalid: 'some fields are not valid', unknown: 'unknown provider', 'built-in': 'a built-in provider is not changed here',
  vault_locked: 'Unlock the vault first — the provider’s key is kept there', vault_not_set_up: 'Set up the vault first — the provider’s key is kept there',   // the dictionary's own keys (the page words them)
  'key-unreadable': 'the vault could not keep the key', 'write-failed': 'the provider list could not be written',
});
/** the variable each harness it serves reads the key from — its descriptor's own plan, asked with no key (the wizard's
 *  technical details; lane lg-providers U5) */
function keyVarsOf(p, f) {
  const out = {};
  for (const [h, x] of Object.entries(f)) {
    if (!x.ok) continue;
    try { const d = require('../harnesses').get(h); const sp = d && d.creds && typeof d.creds.providerSpawn === 'function' ? d.creds.providerSpawn({ provider: p, key: '', home: null }) : null; if (sp && sp.secret && sp.secret.var) out[h] = sp.secret.var; } catch { }
  }
  return out;
}
/** a record as the page reads it — no key (there is none in it), not where the vault keeps it, + which harnesses it serves */
const pubOf = (providers) => (p) => { if (!p) return null; const { keyRef, ...rest } = p; const f = MP.fits(p); return { ...rest, hasKey: typeof providers.hasKey === 'function' ? providers.hasKey(p.id) : !!keyRef, fits: f, keyVars: keyVarsOf(p, f) }; };   // hasKey = the VAULT holds its entry (its names), not the record's reference
// a SELF-HOSTED preset fits a harness when ONE of its interfaces does — the person names it on the next screen (the U5 pictures:
// the «Other or self-hosted» card read «Not for Claude», judged with no interface; the chain cure)
const shippedFits = (s) => (s.kind !== 'self-hosted' ? MP.fits({ kind: s.kind }) : Object.fromEntries(Object.entries(MP.fits({ kind: s.kind })).map(([h, f]) => [h, MP.WIRES.some((w) => MP.fitsHarness({ kind: s.kind, wire: w }, h)) ? { ok: true } : f])));
const shippedPub = (s) => ({ ...s, fits: shippedFits(s) });

function registerProviderRoutes(app, { providers, tester = null, onChange = () => { } }) {
  const pub = pubOf(providers);
  const refuse = (res, r) => res.status(STATUS[r.code] || 400).json({ ok: false, code: r.code, error: WORDS[r.code] || r.code, ...(r.errors ? { errors: r.errors } : {}) });
  const person = (req, res) => {
    const who = personVerdict(req);
    if (who.ok) return true;
    res.status(403).json({ ok: false, code: who.code, error: 'only a person on this page adds or changes a model provider' });
    return false;
  };
  const changed = (what, id) => { try { onChange({ what, id }); } catch { } };
  // an async door's throw answers 500 with words — Express 4 never answers a rejected handler (the request would hang)
  const door = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(() => { if (!res.headersSent) res.status(500).json({ ok: false, code: 'failed', error: 'the provider could not be changed' }); });
  app.use('/api/providers', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.post('/api/providers/list', (req, res) => {
    if (!person(req, res)) return;
    res.json({ shipped: MP.SHIPPED.map(shippedPub), shippedAt: MP.SHIPPED_AT, providers: providers.thirdParty().map(pub) });
  });
  app.post('/api/providers', door(async (req, res) => {
    if (!person(req, res)) return;
    const b = req.body || {};
    const r = await providers.add({ preset: b.preset, key: b.key, region: b.region, baseUrl: b.baseUrl, label: b.label, model: b.model, wire: b.wire });
    if (!r.ok) return refuse(res, r);
    changed('add', r.provider.id);
    res.status(201).json({ ok: true, provider: pub(r.provider) });
  }));
  app.post('/api/providers/:id/key', door(async (req, res) => {
    if (!person(req, res)) return;
    const r = await providers.rekey(String(req.params.id), (req.body || {}).key);
    if (!r.ok) return refuse(res, r);
    changed('rekey', r.provider.id);
    res.json({ ok: true, provider: pub(r.provider) });
  }));
  app.patch('/api/providers/:id', door(async (req, res) => {
    if (!person(req, res)) return;
    const b = req.body || {};
    const r = await providers.patch(String(req.params.id), { label: b.label, baseUrl: b.baseUrl, defaultModel: b.defaultModel, wire: b.wire, key: b.key });
    if (!r.ok) return refuse(res, r);
    changed('patch', r.provider.id);
    res.json({ ok: true, provider: pub(r.provider) });
  }));
  app.post('/api/providers/:id/test', door(async (req, res) => {
    if (!person(req, res)) return;
    if (!tester) return res.status(409).json({ ok: false, code: 'unfit', error: 'the provider test is not available on this hub' });
    let r;
    try { r = await tester.runProviderTest(String(req.params.id), String((req.body || {}).harness || ''), { by: 'human' }); } catch (e) { r = { ok: false, code: 'failed', error: e.message }; }
    if (!r.ok) return res.status(STATUS[r.code] || 409).json({ ok: false, code: r.code, error: PT.REFUSAL_WORDS[r.code] || WORDS[r.code] || r.error || r.code });
    // the key or the address changed while it ran: what it tested is no longer there — said as a refusal with its words, never «Works»
    if (r.changed) return res.status(409).json({ ok: false, code: 'changed', error: PT.REFUSAL_WORDS.changed });
    if (r.verdict !== 'cli-missing') changed('test', String(req.params.id));
    res.json({ ok: true, harness: r.harness, verdict: r.verdict, words: PT.VERDICT_WORDS[r.verdict], detail: r.detail, at: r.at, kept: r.kept !== false });   // kept: false ⇒ the verdict was not written (the page says so)
  }));
  app.delete('/api/providers/:id', door(async (req, res) => {
    if (!person(req, res)) return;
    const r = await providers.remove(String(req.params.id));
    if (!r.ok) return refuse(res, r);
    changed('remove', r.id);
    res.json({ ok: true, id: r.id, keyDropped: r.keyDropped, ...(r.orphan ? { orphan: true } : {}) });
  }));
}

module.exports = { registerProviderRoutes };
