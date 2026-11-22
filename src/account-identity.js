'use strict';
/**
 * THE IDENTITY's OWN NOTION (row B-87fd, unit 2 — 主开发 r1477): ONE record per account row and ONE comparison, the one every
 * «same account?» door is to ask (the doors move onto it one by one, each removing its debt rows from the identity census).
 * PURE: imports nothing, reads nothing. A seat's or an organisation's id and a compared address live in memory only — never in a
 * journal line, a refusal text, a fixture or a kb sentence (r1477's standing word).
 *
 * identityRecordOf({ harness, declared, auth }) → { harness, seat, address, org, conflict }
 *   harness   the row's harness id ('claude' | 'codex' | 'antigravity' | …)
 *   declared  the address the person typed for the row (the record's backfill), or null
 *   auth      the row's folder facts as its harness's own reader keeps them — { email, seat, orgId }, any may be absent; the seat
 *             is read from the member's OWN login folder (claude: .claude.json oauthAccount's accountUuid IN its organizationUuid;
 *             codex: the id_token's ChatGPT user IN its workspace — one person holds a seat in each), never from a home
 *   address   the FOLDER's (trimmed, case-folded) — a READ fact. The declared one only CHECKS it: a typed address no folder
 *             confirms decides nothing (the person's word: a typo there would split one account, a colleague's address typed
 *             onto a signed-out row would merge two — gate 1 of this unit found the split by the laws below)
 *   conflict  a declared address that differs from the folder's: the row is NOBODY's twin until the person resolves it (r1477 [1];
 *             the ONE press on the row — «use the folder's» / «keep the one I typed» — is the accounts page's unit)
 *
 * sameAccount(x, y) → 'same' | 'different' | 'unproven', in this order, never skipping a step:
 *   1. different harness ⇒ different (claude and codex are two accounts whatever their addresses)
 *   2. either row in conflict ⇒ unproven
 *   3. both carry a seat ⇒ same iff equal — the seat decides alone
 *   4. both carry an address ⇒ different addresses ⇒ different; ONE address ⇒ same only when both rows name the SAME organisation
 *      (one address may hold a seat in two organisations); two named organisations that differ ⇒ different; an organisation one
 *      row does not name ⇒ unproven — r1477 [1]'s weighing: a false merge moves the owner's money, a missed one costs one turn
 *   5. anything else — an organisation alone (two seats of one Team look exactly like this), or nothing ⇒ unproven: never merged
 */
const norm = (v) => (v == null ? null : (String(v).trim().toLowerCase() || null));

function identityRecordOf({ harness = null, declared = null, auth = null } = {}) {
  const folderAddress = norm(auth && auth.email);
  const typed = norm(declared);
  return {
    harness: harness ? String(harness) : null,
    seat: norm(auth && auth.seat),
    address: folderAddress,
    org: norm(auth && auth.orgId),
    conflict: !!(typed && folderAddress && typed !== folderAddress),
  };
}

function sameAccount(x, y) {
  if (!x || !y) return 'unproven';
  if (x.harness !== y.harness) return 'different';
  if (x.conflict || y.conflict) return 'unproven';
  if (x.seat && y.seat) return x.seat === y.seat ? 'same' : 'different';
  if (x.address && y.address) {
    if (x.address !== y.address) return 'different';
    if (x.org && y.org) return x.org === y.org ? 'same' : 'different';
    return 'unproven';
  }
  return 'unproven';
}

module.exports = { identityRecordOf, sameAccount };
