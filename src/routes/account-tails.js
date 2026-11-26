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
 *
 * A WHOLE CREDENTIAL WITH NO VAULT (B-ee0a, 主开发 2026-11-19 03:16Z): with no vault set up, GET/POST /api/accounts/:id/key and
 * the config export's sensitive part (src/routes/persistence.js) answered a whole credential to ANY caller. Now their no-vault
 * branch asks `personOnlyDoor` first — the same person verdict: a conversation's, job's or automation's credential is refused by
 * name (credential_person_only), and so is a script that sends no browser headers of this page (credential_page_only). The set-up
 * vault's branch is unchanged (its window, its second password). The config IMPORT's credentials (the sign-in password, the CLI
 * logins) are written only for the person too (its reader's find, cured in the unit). WHAT THIS DOES NOT STOP: on an instance with
 * no sign-in, any process that reaches its port can send the headers a browser on the page sends (Sec-Fetch-Site, or an Origin
 * with a matching X-Forwarded-Host) — a paired machine's conversation through its reverse tunnel to the hub among them — and an
 * agent with a shell on the hub's machine can read the store's files itself. This guards a door handing a credential out by
 * MISTAKE (to an agent's token, to a plain script), not a determined caller; a page-minted secret (as the vault window's) would. And a PAIRED machine's CLI-key tail (GET /api/hosts/:id/accounts-status) is kept here from the last probe
 * and answered only to the person's read (`hostCliKey` for `{ hostId }`).
 */
const { personVerdict } = require('./vault.js');

/** the refusals of a credential door asked by no person (B-ee0a) — the hub's words; the page words its own (src/lib/vault-reveal.js) */
const CREDENTIAL_DOOR_WORDS = Object.freeze({
  credential_person_only: 'only the person, on this VibeSpace page, sees or takes out a whole credential — a conversation, job or automation credential cannot',
  credential_page_only: 'only the person, on this VibeSpace page, sees or takes out a whole credential',
});
/** a no-vault credential door's person check (B-ee0a): true when a person on this page asks; else it answers 403 BY NAME */
function personOnlyDoor(req, res) {
  const who = personVerdict(req);
  if (who.ok) return true;
  const code = who.code === 'human_only' ? 'credential_person_only' : 'credential_page_only';
  res.set('Cache-Control', 'no-store');
  res.status(403).json({ ok: false, code, error: CREDENTIAL_DOOR_WORDS[code] });
  return false;
}

/** B-e381 (主开发 r4680): THE KEPT FOLDER's DOOR (POST /api/accounts/kept/:id/wipe) — a person on this page only (the tree's one person
 *  verdict): any bearer (an agent's vsst_, a job's jbt_, an automation key's vsak_, or a token in the body or the query) answered 403
 *  `human_only` naming them; another site `cross_site`. → true when a person on this page asks */
const KEPT_DOOR_WORDS = Object.freeze({
  human_only: 'only the person, on this VibeSpace page, clears a kept sign-in folder — an agent\'s, a job\'s or an automation\'s sign-in cannot',
  cross_site: 'only the person, on this VibeSpace page, clears a kept sign-in folder — another site cannot',
});
/** B-e381 (主开发 r5296): a removal retries the OTHER owed sign-in folders only for a PERSON on this page (the tree's one person
 *  verdict, as the kept folder's own door asks) — a script's removal (no browser, or any bearer) stays the release's bare removal */
function keptRetryAsked(req) { try { return personVerdict(req).ok === true; } catch { return false; } }
function keptFolderDoor(req, res) {
  const who = personVerdict(req);
  if (who.ok) return true;
  const code = who.code === 'human_only' ? 'human_only' : 'cross_site';
  res.set('Cache-Control', 'no-store');
  res.status(403).json({ ok: false, code, error: KEPT_DOOR_WORDS[code] });
  return false;
}

/** THE KEY REVEAL (GET and POST /api/accounts/:id/key — src/server/account-usage-routes.js wires it): the store is the MASTER copy and
 *  the Console can't re-show it. lane vault-contents-window r2 (verify r1): a set-up vault shows it only through THIS page's reveal
 *  window — the Vault window's own door (people only, ONE value, paced, audited); Manage Agents' Show key… asks 验证是你 first.
 *  B-ee0a: NO VAULT — the whole key only to a person on this page (a credential or a header-less script refused by name). */
function revealKeyDoorOf({ accounts }) {
  return (req, res) => {
    res.set('Cache-Control', 'no-store');   // every answer and refusal of the door, either branch (B-ee0a's take)
    const gate = req.app && req.app.locals ? req.app.locals.vaultGate : null;
    if (gate && gate.state() !== 'not_set_up') {
      const r = gate.reveal(req, `accounts:${req.params.id}#key`);
      return r.ok ? res.json({ key: r.value, leftMs: r.leftMs }) : res.status(gate.statusOf(r.code)).json({ error: gate.refusalOf(r.code), code: r.code, ...(r.retryInMs ? { retryInMs: r.retryInMs } : {}) });
    }
    if (!personOnlyDoor(req, res)) return;
    try { res.json({ key: accounts.revealKey(req.params.id) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  };
}

/** A PAIRED MACHINE'S CLI-KEY TAIL (B-ee0a — the ask answered: yes): the accounts-status answer carries none; the last probe's tail
 *  is kept here per machine (a bounded map: one entry per probed machine) for the person's read */
const hostCliTails = new Map();
/** strip the tail from a probe's facts (IN PLACE — the answer the route sends) and keep it → the facts */
function keepHostCliTail(hostId, facts) {
  if (!facts || typeof facts !== 'object' || !facts.cliKey || typeof facts.cliKey !== 'object') return facts;
  const tail = typeof facts.cliKey.tail === 'string' && facts.cliKey.tail ? facts.cliKey.tail : null;
  if (tail && facts.cliKey.present) hostCliTails.set(String(hostId), tail); else hostCliTails.delete(String(hostId));
  facts.cliKey = { present: !!facts.cliKey.present };
  return facts;
}
/** a machine removed (src/server/exit-routes.js removeHost): its kept tail leaves with it (B-ee0a's take) */
function forgetHostCliTail(hostId) { hostCliTails.delete(String(hostId)); }

/** GET /api/accounts' answer — every account row (no key tail), the subscription and CLI-key facts (no tail), the machines'
 *  names, the local verdicts */
function accountsAnswer({ accounts, hosts = null }) {
  const out = {
    ...accounts.list(),
    subscription: accounts.subscriptionStatus(),
    cliKey: accounts.cliPrimaryKey(),
  };
  if (typeof accounts.tailsGen === 'function') out.tailsGen = accounts.tailsGen();   // read AFTER the CLI key (a different one just seen moves it)
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
    // a paired machine's: the hub's last probe of it, and nothing else read (no CLI file read for this ask)
    const hostId = req.body && typeof req.body.hostId === 'string' && req.body.hostId ? req.body.hostId : null;
    if (hostId) return res.json({ ok: true, tails: { hostCliKey: hostCliTails.get(hostId) || null } });
    let tails = { accounts: {}, cliKey: null };
    try { tails = accounts.keyTails(); } catch { /* an unreadable store answers none */ }
    const gen = typeof accounts.tailsGen === 'function' ? accounts.tailsGen() : null;   // read AFTER the tails (the CLI key just read may move it)
    try { tails = { ...tails, providers: Object.fromEntries((providers && typeof providers.thirdParty === 'function' ? providers.thirdParty() : []).filter((p) => p && typeof p.tail === 'string' && p.tail).map((p) => [p.id, p.tail])) }; } catch { tails = { ...tails, providers: {} }; }
    return res.json({ ok: true, tails, ...(gen ? { gen } : {}) });
  });
}

module.exports = { accountsAnswer, registerAccountTailRoutes, personOnlyDoor, CREDENTIAL_DOOR_WORDS, keptFolderDoor, keptRetryAsked, KEPT_DOOR_WORDS, keepHostCliTail, forgetHostCliTail, revealKeyDoorOf };
