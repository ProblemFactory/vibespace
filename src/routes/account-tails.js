'use strict';
/**
 * THE KEY TAILS ARE THE PERSON'S (B-ba7d — the owner's decision 2026-11-18 14:48 PT, on the coordinator's recommendation).
 *
 * The last characters of a stored credential (an API-key account's tail, the CLI's own primary key's) name WHICH key a person
 * holds; they are answered only to the person's own read:
 *   · GET /api/accounts (accountsAnswer) and the accounts-updated push carry NONE — they reach every client and every
 *     agent-readable mirror, and a session's, a job's or an automation's credential reads them (src/accounts.js list() and
 *     cliPrimaryKey() hold no tail);
 *   · POST /api/accounts/tails answers them ONLY to a person on this page (src/routes/vault.js personVerdict: any Bearer —
 *     an agent's session token, a job's, an automation key — ⇒ 403; a page of another site ⇒ 403) — with the providers' tails,
 *     which the conversation badges (the live payload, GET /api/active) no longer carry. A POST: a plain-http page
 *     sends no Origin on a GET, so a GET cannot be judged (the provider list's road, lane lg-providers U1 cure).
 * The page asks the second and lays the tails on the rows of the first (src/lib/account-tails.js). A provider's tail is the
 * provider list's own (POST /api/providers/list, the same verdict).
 */
const { personVerdict } = require('./vault.js');

/** GET /api/accounts' answer — every account row (no key tail), the subscription and CLI-key facts (no tail), the machines'
 *  names, the local verdicts */
function accountsAnswer({ accounts, hosts = null }) {
  const out = {
    ...accounts.list(),
    subscription: accounts.subscriptionStatus(),
    cliKey: accounts.cliPrimaryKey(),
  };
  // Host id → display name map (2.244.1, real screenshot: the roster's
  // "logged in on host-9a86e4fb" — raw ids leaked whenever the sidebar's
  // hosts data wasn't loaded yet; the server always knows the names)
  try { out.hostNames = Object.fromEntries((hosts?.list?.() || []).map((h) => [h.id, h.name || h.id])); } catch { }
  // LOCAL verdicts (B-f531): same authority as the per-host ones
  try {
    out.verdicts = {};
    for (const a of (out.accounts || [])) {
      try { out.verdicts[a.id] = accounts.evaluateOnHost(accounts.get(a.id), null, {}); } catch { }
    }
  } catch { }
  return out;
}

/** POST /api/accounts/tails — the person's read: { ok, tails: { accounts: { [id]: tail }, cliKey, providers: { [pv-id]: tail } } } (the
 *  providers' for the conversation badges, which carry none) */
function registerAccountTailRoutes(app, { accounts, providers = null }) {
  app.post('/api/accounts/tails', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const who = personVerdict(req);
    if (!who.ok) return res.status(403).json({ ok: false, code: who.code, error: 'only a person on this page reads the last characters of a key' });
    let tails = { accounts: {}, cliKey: null };
    try { tails = accounts.keyTails(); } catch { /* an unreadable store answers none */ }
    try { tails = { ...tails, providers: Object.fromEntries((providers && typeof providers.thirdParty === 'function' ? providers.thirdParty() : []).filter((p) => p && typeof p.tail === 'string' && p.tail).map((p) => [p.id, p.tail])) }; } catch { tails = { ...tails, providers: {} }; }
    return res.json({ ok: true, tails });
  });
}

module.exports = { accountsAnswer, registerAccountTailRoutes };
