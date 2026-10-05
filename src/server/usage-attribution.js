/**
 * THE USAGE ATTRIBUTION LOG — which account (and pool) a conversation bills, recorded by time into the
 * usage history (usageHistory.recordAttribution). MOVED VERBATIM out of server.js (lane
 * dc-seams-server, decoupling wave 2b, review rv-server-core M9 "usage/billing → src/server/usage-*");
 * the three stores it reads arrive once through create() (one server per process). Callers:
 * session-stdout's writeSessionMeta, ws-create's pool re-point, account-usage-routes — all through
 * server.js's lazy `(...a) => recordUsageAttribution(...a)` wrappers.
 */
let activeSessions, accounts, usageHistory; // wired once by create()

// Attribution log: dedup'd per (sid,acct) so a resume under a DIFFERENT account
// is captured with its timestamp (per-request-by-time attribution). Called from
// writeSessionMeta whenever a session has both a claudeSessionId and account.
const _lastAttrib = new Map();
function recordUsageAttribution(meta) {
  const sid = meta && (meta.claudeSessionId || meta.backendSessionId);
  if (!sid) return;
  let acct = meta.accountId || null;
  let pool = null;
  // A POOLED session bills whatever the pool currently points at — attribute
  // the ledger to the REAL target at record time (attribution is by-time, so
  // a later re-point + re-record moves subsequent requests to the new target).
  // Keep the pool id as a SEPARATE tag (#4): acct stays the real target so
  // per-account and the global sum are correct with NO double-count, while pool
  // lets the Usage window show the total that flowed through each pool.
  // An unresolvable pool target (broken symlink / logged-out member) falls to
  // GLOBAL, never to the pool id itself — else a `type:'pooled'` pseudo-account
  // would surface as a spender in the account dimension (review low-confidence
  // finding). The pool tag is still recorded (pool captured above).
  try {
    if (acct && accounts.get(acct)?.type === 'pooled') {
      pool = acct;
      // Plan C: a session with its OWN link bills that link's target — the
      // live session is looked up by conversation id (the attribution key we
      // were handed) so the per-session choice lands in the ledger; a non-hot pool process (codex) bills the member it HOLDS (reset credits r3 — accounts.poolMemberOfSession).
      let sessKey = null, live = null;
      try { for (const [wid, s2] of activeSessions) if ((s2.claudeSessionId || s2.backendSessionId) === sid && s2._accountId === acct) { sessKey = wid; live = s2; break; } } catch { }
      acct = (live ? accounts.poolMemberOfSession(acct, live, sessKey).id : accounts.poolCurrentFor(acct, sessKey)) || null;
    }
  } catch {}
  const attribKey = (acct || '') + '|' + (pool || '');
  if (_lastAttrib.get(sid) === attribKey) return;
  _lastAttrib.set(sid, attribKey);
  // Cap only — never delete-on-kill: kill→resume of the same sid (terminate/
  // resume, billing switch) would re-append a duplicate attribution line.
  if (_lastAttrib.size > 4096) _lastAttrib.delete(_lastAttrib.keys().next().value);
  usageHistory.recordAttribution({ sid, acct, pool, ts: Date.now() });
}

function create(deps) {
  ({ activeSessions, accounts, usageHistory } = deps);
  return { recordUsageAttribution };
}

module.exports = { create };
