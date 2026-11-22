'use strict';
/**
 * THE IDENTITY's OWN NOTION (row B-87fd, unit 2 — 主开发 r1477): ONE record per account row and ONE comparison, the one every
 * «same account?» door is to ask (the doors move onto it one by one, each removing its debt rows from the identity census).
 * PURE: imports nothing, reads nothing. A seat's or an organisation's id and a compared address live in memory only — never in a
 * journal line, a refusal text, a fixture or a kb sentence (r1477's standing word).
 *
 * identityRecordOf({ harness, declared, auth }) → { harness, seat, address, org, conflict } — or null when nothing is handed (no
 * record: sameAccount answers «unproven»), never a throw. STRINGS ONLY: any other value is no fact (round wvjd20mpa (3)).
 *   harness   the row's harness id ('claude' | 'codex' | 'antigravity' | …)
 *   declared  the address the person typed for the row (the record's backfill), or null
 *   auth      the row's folder facts as its harness's own reader keeps them — { email, seat, orgId }, any may be absent. The seat is
 *             the PERSON's id as the member's OWN login folder names it (claude: .claude.json oauthAccount's accountUuid; codex: the
 *             id_token's ChatGPT user), never from a home. A SEAT is that person IN its organisation (claude: organizationUuid;
 *             codex: the workspace) — the record keeps the pair APART (seat, org) and names no seat without an organisation: one
 *             person holds a seat in each
 *   seat, org kept as written (trimmed): an id's case is part of it (codex user ids are mixed case)
 *   address   the FOLDER's (trimmed, case-folded — the address ALONE is folded) — a READ fact. The declared one only CHECKS it: a
 *             typed address no folder confirms decides nothing (the person's word: a typo there would split one account, a
 *             colleague's address typed onto a signed-out row would merge two — gate 1 of this unit found the split by the laws)
 *   conflict  a declared address that differs from the folder's: the row is NOBODY's twin until the person resolves it (r1477 [1];
 *             the ONE press on the row — «use the folder's» / «keep the one I typed» — is the accounts page's unit)
 *
 * sameAccount(x, y) → 'same' | 'different' | 'unproven', in this order, never skipping a step:
 *   1. different harness ⇒ different (claude and codex are two accounts whatever their addresses)
 *   2. either row in conflict ⇒ unproven
 *   3. both carry a seat ⇒ same iff the SAME person in the SAME organisation (the pair compared part by part) — the seat decides alone
 *   4. both carry an address ⇒ different addresses ⇒ different; ONE address ⇒ same only when both rows name the SAME organisation
 *      (one address may hold a seat in two organisations); two named organisations that differ ⇒ different; an organisation one
 *      row does not name ⇒ unproven — r1477 [1]'s weighing: a false merge moves the owner's money, a missed one costs one turn
 *   5. anything else — an organisation alone (two seats of one Team look exactly like this), or nothing ⇒ unproven: never merged
 *
 * beforeAfterVerdict({ before, after, word, lost }) → 'same' | 'different' | 'ask' — A DOOR THAT COMPARES ONE ROW BEFORE AND AFTER
 * a sign-in into its folder (the relogin's resolve, identity unit 3 — 主开发 r2533 / r2536). `before` / `after` are records (or null),
 * `word` the row's own word (its typed address, or a name that is an address), `lost` = the kept BEFORE is gone (a restart, its time):
 *   R1  NOTHING TO DISAGREE WITH ⇒ same (in place, nothing asked): AFTER names nothing read (no seat, no address), or BEFORE names
 *       nothing and the row has no word — a first sign-in is what names a row
 *   R2  BEFORE names something read ⇒ sameAccount: same ⇒ same; different ⇒ different (moved / a new row); unproven ⇒ ask (read
 *       facts that do not decide)
 *   R3  A WORD CHECKS A READ: BEFORE's only fact is the row's word ⇒ equal to AFTER's read address (case-folded) ⇒ same; else ⇒ ask —
 *       never a split on a word alone (a word can be a typo)
 *   a LOST before with no word ⇒ ask (the row says the sign-in finished across a restart): unknown is not nothing
 */
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const addressOf = (v) => { const s = str(v); return s ? s.toLowerCase() : null; };

function identityRecordOf(arg) {
  if (!arg || typeof arg !== 'object') return null;
  const { harness = null, declared = null, auth = null } = arg;
  const facts = auth && typeof auth === 'object' ? auth : {};
  const folderAddress = addressOf(facts.email);
  const typed = addressOf(declared);
  const org = str(facts.orgId);
  return {
    harness: str(harness),
    seat: org ? str(facts.seat) : null,
    address: folderAddress,
    org,
    conflict: !!(typed && folderAddress && typed !== folderAddress),
  };
}

function sameAccount(x, y) {
  if (!x || !y) return 'unproven';
  if (x.harness !== y.harness) return 'different';
  if (x.conflict || y.conflict) return 'unproven';
  if (x.seat && y.seat) return x.seat === y.seat && x.org === y.org ? 'same' : 'different';
  if (x.address && y.address) {
    if (x.address !== y.address) return 'different';
    if (x.org && y.org) return x.org === y.org ? 'same' : 'different';
    return 'unproven';
  }
  return 'unproven';
}

function beforeAfterVerdict({ before = null, after = null, word = null, lost = false } = {}) {
  const readNames = (r) => !!(r && typeof r === 'object' && (r.seat || r.address));
  if (!readNames(after)) return 'same';
  if (readNames(before)) { const v = sameAccount(before, after); return v === 'unproven' ? 'ask' : v; }
  const w = addressOf(word);
  if (w) return after.address && w === after.address ? 'same' : 'ask';
  return lost ? 'ask' : 'same';
}

module.exports = { identityRecordOf, sameAccount, beforeAfterVerdict };
