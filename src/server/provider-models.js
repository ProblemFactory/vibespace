'use strict';
/**
 * THE LISTED-PROVIDER REFRESH (design q-053 r1 §3, lane models-at-session = Train 1 row P0c) — THE ONE place the hub asks a
 * third-party provider for its model list (OpenRouter's /api/v1/models, an OpenAI-compatible /v1/models). It is a vendor
 * request, allowlisted in scripts/test-vendor-whitelist.mjs §13 (the row's marker below) with its gates — each one CODE here:
 *   · A PERSON'S PRESS. `refreshListedModels` has ONE caller: the door POST /api/providers/:id/models/refresh
 *     (src/routes/provider-models.js), which refuses an agent's token and another site and says `by: 'human'`. No timer, no
 *     loop, no boot step calls it, and this file holds no timer at all (the 15 s deadline is the request's own signal).
 *   · THE VAULT OPEN. The key is a vault entry (the record's `keyRef`); a locked vault refuses before anything is read or sent.
 *   · ONCE A MINUTE per provider at most (an attempt counts, a failed one too) and one in flight.
 *   · A CACHE. The answer is kept on the record (data/providers.json: models + fetchedAt, shown by the account dialog);
 *     every menu reads the record — nothing asks the provider at a menu, a spawn or a boot.
 * The verdicts are PURE (src/model-providers.js refreshVerdict · parseListed · authHeaders); this file is the request.
 */
const MP = require('../model-providers.js');
const VI = require('../vault-inventory.js');

/** The record's key out of the vault: `keyRef` = a vault row reference `<store>:<entry>#<field>` — an Integrations row's
 *  secret field (the store's consumer read, resolveIntegration). → { ok, value } | { ok: false, code: 'key-unreadable' }. */
function vaultKeyOf({ getIntegrations = () => null } = {}) {
  return (keyRef) => {
    const ref = VI.parseRef(String(keyRef || ''));
    const store = ref && ref.store === 'integrations' ? getIntegrations() : null;
    if (!store || typeof store.resolveIntegration !== 'function') return { ok: false, code: 'key-unreadable' };
    try {
      const v = store.resolveIntegration(ref.entry).values[ref.field];
      return typeof v === 'string' && v ? { ok: true, value: v } : { ok: false, code: 'key-unreadable' };
    } catch { return { ok: false, code: 'key-unreadable' }; }
  };
}

/** The body, read up to `max` bytes (a longer one is cancelled and refused — never kept in part). */
async function readCapped(res, max) {
  const len = Number(res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-length') : NaN);
  if (len > max) { try { await res.body.cancel(); } catch { } return null; }
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) { const text = await res.text(); return Buffer.byteLength(text) > max ? null : text; }
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch { } return null; }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts).toString('utf8');
}

/**
 * @param {object} o
 * @param {object} o.providers   the store (src/server/provider-store.js): get · setListed
 * @param {() => string} o.vaultState   'unlocked' | 'locked' | 'not_set_up' (the hub's vault engine)
 * @param {(keyRef: string) => ({ ok: boolean, value?: string })} o.keyOf   the vault entry's value (vaultKeyOf)
 * @param {Function} [o.fetchImpl]   the request primitive (a suite hands a loopback one)
 */
function create({ providers, vaultState = () => 'locked', keyOf = () => ({ ok: false, code: 'key-unreadable' }), fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now(), log = (m) => console.log(m) } = {}) {
  const fetch = fetchImpl;       // the request primitive by its census name (a suite hands in a loopback one)
  const lastAt = new Map();      // provider id → its last attempt (the cooldown's clock; in memory — fetchedAt carries it across a restart)
  const inFlight = new Set();
  /** ONE press of the refresh door → { ok, provider, listed, skipped } | { ok: false, code, retryAfterMs?, status? }. */
  async function refreshListedModels(id, { by = null } = {}) {
    if (by !== 'human') return { ok: false, code: 'human_only' };
    const provider = providers.get(String(id || ''));
    const v = MP.refreshVerdict({ provider, vault: vaultState(), now: now(), lastAt: lastAt.get(provider && provider.id), inFlight: inFlight.has(provider && provider.id) });
    if (!v.ok) return v;
    lastAt.set(provider.id, now());
    inFlight.add(provider.id);
    try {
      const key = provider.keyRef ? keyOf(provider.keyRef) : { ok: true, value: null };
      if (!key || !key.ok) return { ok: false, code: 'key-unreadable' };
      const headers = { accept: 'application/json', ...MP.authHeaders(provider, key.value) };
      let res;
      try {
        // PROVIDER_MODELS — the one request: a GET of the provider's list, 15 s, never a redirect (the key stays on its host)
        res = await fetch(v.url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(MP.REFRESH.timeoutMs) });
      } catch (e) { return { ok: false, code: 'unreachable', reason: String((e && (e.cause && e.cause.code || e.name)) || 'error').slice(0, 60) }; }
      if (!res.ok) { try { await res.body.cancel(); } catch { } return { ok: false, code: 'http', status: res.status }; }
      const text = await readCapped(res, MP.REFRESH.maxBytes).catch(() => null);
      if (text === null) return { ok: false, code: 'too-large' };
      let body;
      try { body = JSON.parse(text); } catch { return { ok: false, code: 'bad-answer' }; }
      const parsed = MP.parseListed(body);
      if (!parsed.ok) return parsed;
      const w = providers.setListed(provider.id, parsed.rows, now());
      if (!w.ok) return w;
      log(`[providers] ${provider.id}: the provider listed ${parsed.rows.length} model(s)${parsed.skipped ? ` (${parsed.skipped} skipped)` : ''}`);
      return { ok: true, provider: w.provider, listed: parsed.rows.length, skipped: parsed.skipped, droppedAliases: w.droppedAliases || [] };
    } finally { inFlight.delete(provider.id); }
  }
  return { refreshListedModels };
}

module.exports = { create, vaultKeyOf };
