'use strict';
/**
 * WHOSE ACCOUNT IS THIS — PURE (imports nothing; CJS so the engine and the
 * suites share one spelling). Lane R5 verify r5 (2026-09-27, credential class).
 *
 * A channel account RECORD owns conversations, a message log, assignments and
 * reach grants. A consent that lands on that record therefore decides whose
 * mailbox every agent handed the account reads. Before this module a
 * re-authorize as ANOTHER Google / Lark user was stored with `ok:true` (the
 * wrong account picked in the vendor's chooser is an ordinary slip on a
 * browser with several logins): the record's grants silently retargeted onto a
 * stranger's mail, its cursor and index still the old user's.
 *
 * The rule: the identity a token NAMES (`identityOf`) must match the identity
 * the record HOLDS (`heldIdentity` — stamped by the first consent that named
 * one, kept across a disconnect, forgotten only by remove); the comparison is
 * over the keys BOTH sides carry — one common key equal = the same person, no
 * common key = nothing to judge (accepted, then stamped). Lark's `open_id` is
 * per app, so a client switch legitimately brings a new one: `union_id` (per
 * developer) and `user_id` (per tenant) are compared beside it, and a rebind
 * under another app matches on whichever survives. Gmail's email is lowercased.
 *
 * verify r6 (2026-09-27): (1) A CONSENT MUST NAME ITS ACCOUNT — a consent the
 * vendor answered no identity for (the profile / user_info read failed) is
 * REFUSED by the adapter (`namelessSentence`), never stored: a nameless token
 * bound nothing, so the record took ANYONE's next consent, and a stranger's
 * nameless consent landed on a bound record unjudged ("no common key"). (2) A
 * LEGACY record (pre-r5, no stamp) is judged by the token it HOLDS
 * (`heldIdentity(rec, storedToken)` — Lark's `auth.user` is a display name,
 * never an id) and stamped from it at boot (`stampIdentities`); a legacy
 * record disconnected before it was stamped holds no evidence and takes the
 * next consent (said in the kb).
 */
const IDENTITY_KEYS = Object.freeze(['email', 'openId', 'unionId', 'userId']);
/** verify r7: an `email` key is an identity only when it LOOKS LIKE AN ADDRESS — a profile answering whitespace or a
 *  bare word used to pass the adapter's truthiness check and land a token that named nobody (the r6 hole, back through
 *  an off-contract vendor), and a Lark DISPLAY NAME containing '@' ("Alice @ Sales") was stamped at boot as an email. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function looksLikeEmail(s) { return typeof s === 'string' && EMAIL_RE.test(s.trim()); }

/** The identity a token record names: `{email}` (Gmail) / `{openId, unionId, userId}` (Lark), only the keys present. */
function identityOf(token) {
  const out = {};
  if (!token || typeof token !== 'object') return out;
  for (const k of IDENTITY_KEYS) {
    const v = token[k]; if (v == null || !String(v).trim()) continue;
    if (k === 'email' && !looksLikeEmail(String(v))) continue;   // verify r7: a non-address names nobody
    out[k] = String(v).trim().toLowerCase();
  }
  return out;
}
/** The identity the record holds: its stamped `identity`, else the token it HOLDS (`storedToken`, decrypted by the
 *  caller — a legacy record's token names its holder: Gmail's email, Lark's open_id), else (a legacy record with no
 *  token) the `auth.user` when it is an email. */
function heldIdentity(rec, storedToken = null) {
  if (!rec || typeof rec !== 'object') return {};
  if (rec.identity && typeof rec.identity === 'object') { const h = identityOf(rec.identity); if (Object.keys(h).length) return h; }
  const t = identityOf(storedToken);
  if (Object.keys(t).length) return t;
  const u = rec.auth && typeof rec.auth.user === 'string' ? rec.auth.user.trim().toLowerCase() : '';
  return looksLikeEmail(u) ? { email: u } : {};   // verify r7: an address, never a display name with an '@' in it
}
/** verify r7: the sentence a consent that was CANCELLED (a disconnect, a cancel, a newer sign-in, the flow's timeout)
 *  while it was being completed is refused with — the human act that cancelled it is the later one and wins.
 *  verify r8: the tail says what the record HOLDS at the refusal — a refused sign-in on a record that keeps a live
 *  token used to read "nothing was connected" under a card that said connected. */
function cancelledSentence(vendor, why, held = false) {
  // client-from-mount verify r4: `over-limit` = the consent machine's cap ended it (32 sign-ins were open) — its own words, never "cancelled"
  return `the ${vendor} sign-in was ${why === 'superseded' ? 'replaced by a newer sign-in' : why === 'timeout' ? 'past its time limit' : why === 'shutdown' ? 'ended by a shutdown' : why === 'over-limit' ? 'ended to make room for newer sign-ins' : 'cancelled'} while it was being completed — ${held ? 'the account keeps its current sign-in' : 'nothing was connected'}`;
}
/** verify r6: the sentence a consent that named NO account is refused with (the adapter's exchange throws it). */
function namelessSentence(vendor, why) {
  return `${vendor} did not say which account signed in (${why}) — nothing was connected; retry the sign-in`;
}
/** `null` = the same person (or nothing to judge); else `{key, held, offered}` naming the first differing common key. */
function identityMismatch(held, offered) {
  const h = identityOf(held), o = identityOf(offered);
  const common = IDENTITY_KEYS.filter((k) => h[k] && o[k]);
  if (!common.length) return null;
  if (common.some((k) => h[k] === o[k])) return null;
  const k = common[0];
  return { key: k, held: h[k], offered: o[k] };
}
/** The one sentence a refused consent carries (the account card's last sign-in line, the log). */
function mismatchSentence(label, mm) {
  return `${label} is connected as ${mm.held}; this sign-in is ${mm.offered} — a re-authorize must be the same account (to read another account, add it as a new account, or remove this one first)`;
}

module.exports = { IDENTITY_KEYS, EMAIL_RE, looksLikeEmail, identityOf, heldIdentity, identityMismatch, mismatchSentence, namelessSentence, cancelledSentence };
