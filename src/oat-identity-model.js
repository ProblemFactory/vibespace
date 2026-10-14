'use strict';
// PURE (CJS; imports only reading-lag + record-lateness, both PURE) — WHOSE IS
// THIS LONG-LIVED TOKEN, AFTER THE MINT (lane oat-identity-postcheck, B-3102's
// two left halves; closed against verify r1 by lane oat-identity-fix).
//
// THE LADDER BEFORE THIS FILE (oat-verify-fixes, .263): a minted token is saved
// only under the row it PROVES — (1) the sign-in identity the CLI left in the
// scratch config, (2) ONE /usage panel read with the new token, its weekly
// window against every row's anchor, (3) else the owner picks, journaled
// owner-confirmed. CLI 2.1.296's setup-token records no account, and a real
// oat is inference-only (its /usage read usually fails), so (3) is the common
// end: the token is saved on the owner's word.
//
// THE TWO NEW RUNGS:
//  (a) THE ANCHOR. When the probe DID state a weekly window and the owner
//      picked the row, that window (+ the probe's org, when it carried one)
//      becomes the row's token anchor (`oatAnchor` on the account record,
//      journaled `anchor: owner-confirmed`). A row that already holds an anchor
//      the probe DISAGREES with keeps it: the disagreement is a new mismatch
//      (the mint refuses a later probe that differs; the post-check below says
//      it), never a silent overwrite. The anchor is NOT the `.window-` sidecar
//      the reading guard files by — a wrong pick there would re-file the row's
//      own login readings. The slot law and the guard are untouched. The anchor
//      FOLLOWS the row's own re-anchors (a renewal, a moved window) when the
//      evidence is independent of the token (verify r1 F6, the orchestrator).
//  (b) THE PASSIVE POST-CHECK. A reading judges the token only when it was
//      produced ON THE TOKEN SAVED NOW: the slot spends the token (an env-token
//      spawn, or a member folder holding our token file) AND the conversation
//      carries the token's GENERATION (its mint instant — verify r1 F1: a
//      conversation still running on the PREVIOUS token re-marked a healthy
//      re-mint and confirmed a wrong one), AND the reading is a witness the
//      slot's API ring would take (`apiWitnessEligibility`: slot validated, not
//      shadowed, no re-point inside the horizon — F2: a hot switch's in-flight
//      reading marked a freshly minted member). It is compared with the row's
//      known identity: the window the row established independently of the
//      token, else the oatAnchor. Same WEEKLY phase ⇒ `confirmed`, journaled
//      once (an anchor this token's own mint probe wrote says `self`, never
//      "agrees with the row"). Different ⇒ a SUSPECT; K consecutive suspects in
//      one phase (K = the engine's API_WITNESS_K) ⇒ `mismatch`: the token is
//      KEPT, the row is marked, the pool places nothing new where it would
//      spend the token, ONE For-you notice. With NO anchor, a reading whose
//      window is ANOTHER row's (identity groups collapsed, non-account keys
//      never counted — F3) is a HINT: ONE ask, never a mark (F4: weekly resets
//      are hour-quantized, 168 phases — a coincidence repeats on every reading,
//      so no run of them can tell it from a real match; the owner's answer
//      can). Nothing here ever moves a reading: attribution stays by slot.
//
// IDENTITY IS PROVEN ONLY BY EVIDENCE NO GENERATION OF THIS ROW'S TOKEN PRODUCED (lane oat-identity-fix-r2,
// verify r2 F-A: a correct re-mint was marked foreign by the PREVIOUS token's own stamps). Every `.window-` stamp
// names its PRODUCER — `login` (the row's own sign-in) or `oat:<gen>` (a generation of its long-lived token); the
// row's identity is a login stamp, the login identity a token's re-stamp CARRIED (`login`), a legacy stamp (no
// producer) only when it predates the row's first token, or an anchor the OWNER answered — the newest of them. A
// mint probe's anchor is `self` for its own generation and retired at the next save; it is never row identity.
// Other accounts are named by THEIR identity the same way. A K-run on a phase no other account's identity holds
// is `moved` — the owner is asked (a renewal, a plan change, or an account outside the roster), never a mark.
//
// TWO LAWS UNDER THE RULE (lane oat-identity-fix-r3, verify r3 F-R1 / F-R2 — two writers the rule never named):
//  1. ONE `.window-` WRITER (src/window-stamp.js writeWindowStamp): every stamp names its producer — `login`, `oat:<gen>`,
//     `repair:<the producer of the stamp it agreed with>` or `null` (nobody can tell) — a missing one throws, and a stamp
//     the login did not write CARRIES the identity it replaces. Here: an `unknown` / `repair` stamp is judged like a legacy
//     one (identity only when written before the row's first token — no generation of the token existed yet), never by
//     itself after it; the identity it carried is the row's.
//  2. A READING'S ROAD IS A FACT OF THE SESSION (persisted, restored, never guessed): a reading whose road is unknown is
//     no witness's producer and judges nothing (`stale-token`, `road: 'unknown'`). A row whose stamp can no longer say who produced it and
//     nothing else proves (`identityLost`) is ASKED once (`lost` ⇒ the anchor ask, 「身份未验证」) — never a mark, never
//     a silent loss.
//
// THE WEEKLY PHASE IS THE ONLY WINDOW EVIDENCE (reading-lag's compareWindows:
// a 5-hour reset names a time, never an account — and it is no anchor change
// either, F5). An org is compared when BOTH sides state one: a different org
// is a suspect like a different phase; the same org confirms nothing by itself
// (two seats in one org — B-3102 (c)).
const { compareWindows, windowOf, windowFingerprint } = require('./reading-lag.js');
const { LATE_MS } = require('./record-lateness.js');

const CHECK_STATES = Object.freeze(['pending', 'confirmed', 'mismatch']);
const POST_CHECK_VERDICTS = Object.freeze(['idle', 'late', 'not-the-token', 'stale-token', 'ineligible', 'no-evidence', 'no-anchor', 'lost', 'hint', 'suspect', 'confirmed', 'moved', 'mismatch']);
const ANCHOR_HOWS = Object.freeze(['owner-confirmed']); // a proven probe writes none: the row's established window already said it, and a second copy would go stale at a renewal
const ASK_KINDS = Object.freeze(['hint', 'anchor']); // hint: no anchor, another row's window (F4) · anchor: the row's window moved by the token's own readings (F6)
const MISMATCH_RUN = 3;   // = the engine's API_WITNESS_K (test-oat-identity pins the two equal): K agreeing suspects before a mark
const UNVERIFIED_MS = 24 * 3600e3; // a token no reading has judged for a day says 「身份未验证」 on its row (F8) — the roster only, never a notice

const low = (v) => (v == null || v === '' ? null : String(v).trim().toLowerCase());
/** {sevenDay, fiveHour, scoped} of any shape reading-lag reads (a normalized window passes through) */
const winOf = (x) => (x && x.scoped && typeof x.scoped === 'object' ? { sevenDay: Number(x.sevenDay) > 0 ? Number(x.sevenDay) : null, fiveHour: Number(x.fiveHour) > 0 ? Number(x.fiveHour) : null, scoped: { ...x.scoped } } : windowOf(x));
/** the WEEKLY half only (verify r1 F5: the 5-hour reset is a time, so it is never part of an identity or an anchor) */
function weeklyOf(x) {
  const w = winOf(x);
  const scoped = {};
  for (const [k, v] of Object.entries(w.scoped || {})) if (Number(v) > 0) scoped[String(k).toLowerCase()] = Number(v);
  return { sevenDay: w.sevenDay || null, fiveHour: null, scoped };
}
/** does it state a WEEKLY half (the only identity evidence)? */
function hasWeekly(x) { const w = x ? winOf(x) : null; return !!(w && (w.sevenDay || Object.keys(w.scoped).length)); }
/** F5: has the row's anchor MOVED — a different WEEKLY phase (a panel re-stamp of the same week with a new 5-hour
 *  block, or the ±60 s spelling, is no move) */
function anchorMoved(cur, was) { return !!(cur && was && hasWeekly(cur) && hasWeekly(was) && compareWindows(weeklyOf(cur), weeklyOf(was)) === 'differ'); }

/** (a) The anchor an owner pick writes: the probe's weekly window + its org. null when the
 *  probe stated no weekly window (then the post-check judges against what the row already knows). */
function anchorFromProbe(probeWindow, { orgUuid = null, at = 0, how = 'owner-confirmed', mint = null } = {}) {
  if (!hasWeekly(probeWindow) || !ANCHOR_HOWS.includes(how)) return null;
  const w = weeklyOf(probeWindow);
  return { sevenDay: w.sevenDay, scoped: w.scoped, orgUuid: low(orgUuid), fp: windowFingerprint(w), at: Number(at) || 0, how, ...(mint ? { mint: String(mint) } : {}) };
}

/** (a) What a save does with the probe's window, given the row's anchors (`established` = the `.window-`
 *  sidecar, `oatAnchor` = an earlier pick's). 'write' — no anchor yet, or the probe agrees (refreshed);
 *  'keep' — an anchor DISAGREES: never overwritten (the post-check / a later mint says the mismatch);
 *  'none' — the probe stated no weekly window. */
function anchorWriteVerdict({ probeWindow = null, established = null, oatAnchor = null } = {}) {
  if (!hasWeekly(probeWindow)) return { verdict: 'none', why: 'the probe stated no weekly window' };
  for (const [name, a] of [['oatAnchor', oatAnchor], ['established', established]]) {
    if (a && hasWeekly(a) && compareWindows(winOf(probeWindow), winOf(a)) === 'differ') return { verdict: 'keep', why: `the row's ${name === 'oatAnchor' ? 'confirmed token anchor' : 'established window'} ${windowFingerprint(weeklyOf(a))} differs from the probe's ${windowFingerprint(weeklyOf(probeWindow))}`, against: name };
  }
  return { verdict: 'write' };
}

/** (a) A LATER probe against the row's own token anchor: 'differ' ⇒ a NEW mismatch (the mint refuses to save
 *  it under this row), 'agree' ⇒ proof, 'unknown' ⇒ nothing said. */
function probeAgainstAnchor(probeWindow, oatAnchor) {
  if (!oatAnchor || !hasWeekly(oatAnchor) || !hasWeekly(probeWindow)) return 'unknown';
  return compareWindows(winOf(probeWindow), winOf(oatAnchor));
}

/** WHO PRODUCED a `.window-` stamp (lane oat-identity-fix-r2; r3): 'login' — the row's own sign-in · 'token' — a generation
 *  of its long-lived token (`oat:<gen>`, or any producer we cannot vouch for) · 'repair' — the standing identity repair
 *  re-wrote a stamp it agreed with (`repair:<that stamp's producer>`) · 'unknown' — `producer: null`, a writer that could
 *  not tell (a conversation whose road is unknown, a repair whose evidence names no producer) · 'legacy' — written before
 *  stamps named their producer (no field, or no string) · null — no stamp. */
function stampProducer(st) {
  if (!st || typeof st !== 'object') return null;
  if (st.producer === 'login') return 'login';
  if (st.producer === null && Object.prototype.hasOwnProperty.call(st, 'producer')) return 'unknown';
  if (typeof st.producer === 'string' && st.producer.startsWith('repair:')) return 'repair';
  if (typeof st.producer === 'string' && st.producer) return 'token';
  return 'legacy';
}
/** Is a stamp IDENTITY evidence — produced by no generation of the row's token? A login stamp is, a token's never;
 *  a legacy, unknown or repair one only when stamped at or before `firstAt`, the first instant the row held a long-lived
 *  token (null = it never held one): no generation of the token existed to produce its evidence (fix r3 F-R2). */
function stampIsIdentity(st, firstAt = null) {
  const p = stampProducer(st);
  if (!p || p === 'token' || !hasWeekly(st)) return false;
  if (p === 'login') return true;
  return !(Number(firstAt) > 0) || (Number(st.at) > 0 && Number(st.at) <= Number(firstAt));
}
/** An anchor the OWNER answered (or one that followed a re-anchor proven without the token) — never a mint probe's:
 *  that was the token's own reading, `self` for its own generation and retired at the next save. */
function isIdentityAnchor(a) { return !!(a && typeof a === 'object' && hasWeekly(a) && (!a.mint || a.followed)); }
/** What a `.window-` stamp the login did not write CARRIES of the row's identity (the ONE writer computes it — fix r3):
 *  the stamp it replaces when that one was the login's (or a legacy / unknown / repair one carrying nothing — judged by
 *  its own `at` later), else the identity that one carried. */
function identityCarry(prev) {
  if (!prev || typeof prev !== 'object' || !hasWeekly(prev)) return null;
  const p = stampProducer(prev);
  const carried = prev.login && hasWeekly(prev.login) ? { ...prev.login, scoped: { ...(prev.login.scoped || {}) } } : null;
  if (p === 'token') return carried;
  if ((p === 'unknown' || p === 'repair') && carried) return carried;
  const w = weeklyOf(prev);
  return { sevenDay: w.sevenDay, scoped: w.scoped, at: Number(prev.at) || 0, ...(p === 'login' ? { producer: 'login' } : {}) };
}
/** THE ROW'S IDENTITY — the WEEKLY window evidence no generation of its token produced says is the row's: the `.window-`
 *  stamp when it is identity (stampIsIdentity), else the login identity a token's re-stamp carried, and an identity
 *  anchor (isIdentityAnchor) — the newer of the two (an owner's answer after a plan change outranks the older login
 *  stamp; a later login proof outranks the answer). null = nothing proven. */
function identityOf({ established = null, oatAnchor = null, firstAt = null } = {}) {
  const cands = [];
  const st = stampIsIdentity(established, firstAt) ? established : (established && stampIsIdentity(established.login, firstAt) ? established.login : null);
  if (st) cands.push({ w: st, via: 'established', at: Number(st.at) || 0, orgUuid: null });
  if (isIdentityAnchor(oatAnchor)) cands.push({ w: oatAnchor, via: oatAnchor.how || 'owner-confirmed', at: Number(oatAnchor.at) || 0, orgUuid: low(oatAnchor.orgUuid) });
  if (!cands.length) return null;
  const best = cands.reduce((x, y) => (y.at > x.at ? y : x));
  const w = weeklyOf(best.w);
  return { window: w, via: best.via, fp: windowFingerprint(w), orgUuid: best.orgUuid, at: best.at };
}
/** THE ROW'S IDENTITY WAS LOST, NOT NEVER MADE (lane oat-identity-fix-r3, verify r3 F-R2): its `.window-` stamp states a
 *  weekly window, nothing about it is identity — a legacy / unknown / repair stamp written after the row's first token,
 *  or a stamp carrying such a one — and no anchor the owner answered. The owner is asked ONCE (`lost`), never a mark. A
 *  row whose window only its own token ever stamped (nothing carried — a fresh token-only row) had nothing to lose. */
function identityLost({ established = null, oatAnchor = null, firstAt = null } = {}) {
  if (!hasWeekly(established) || identityOf({ established, oatAnchor, firstAt })) return false;
  const p = stampProducer(established);
  return p === 'legacy' || p === 'unknown' || p === 'repair' || !!(established.login && hasWeekly(established.login));
}
/** every row's IDENTITY window, {id: weekly window} — `windows` = the `.window-` stamps, `anchors` = the token anchors,
 *  `firstAt(id)` = the first instant that row held a long-lived token (null = never) */
function identityWindows({ windows = {}, anchors = {}, firstAt = () => null } = {}) {
  const out = {};
  for (const id of new Set([...Object.keys(windows || {}), ...Object.keys(anchors || {})])) {
    let fa = null; try { fa = firstAt(id); } catch { fa = null; }
    const idn = identityOf({ established: (windows || {})[id] || null, oatAnchor: (anchors || {})[id] || null, firstAt: fa });
    if (idn) out[id] = idn.window;
  }
  return out;
}

/** (b) THE ROW'S KNOWN IDENTITY for its token's post-check — its WEEKLY half only (F5): identityOf (evidence no
 *  generation of the token produced — fix r2 F-A). Else THIS generation's own mint-probe anchor, `via: 'self'` (at or
 *  after the save, never followed — F6: the token agreeing with its own probe proves the probe, not the row); a
 *  previous generation's is nothing (setOat retires it). `firstAt` unknown ⇒ the save: the row held a token at least
 *  since then. null = nothing to compare with yet. */
function rowAnchorOf({ established = null, oatAnchor = null, since = 0, firstAt = null } = {}) {
  const idn = identityOf({ established, oatAnchor, firstAt: Number(firstAt) > 0 ? Number(firstAt) : (Number(since) > 0 ? Number(since) : null) });
  if (idn) return { window: idn.window, via: idn.via, fp: idn.fp, orgUuid: idn.orgUuid };
  if (oatAnchor && hasWeekly(oatAnchor)) {
    const self = !!oatAnchor.mint && !oatAnchor.followed && Number(since) > 0 && Number(oatAnchor.at) >= Number(since);
    if (self) { const w = weeklyOf(oatAnchor); return { window: w, via: 'self', fp: windowFingerprint(w), orgUuid: low(oatAnchor.orgUuid) }; }
  }
  return null;
}
/** (b) rowAnchorOf found nothing and the row's identity was LOST (identityLost, the same first-token instant): the owner is
 *  asked once (fix r3) */
function rowLostOf({ established = null, oatAnchor = null, since = 0, firstAt = null } = {}) {
  if (rowAnchorOf({ established, oatAnchor, since, firstAt })) return false;
  return identityLost({ established, oatAnchor, firstAt: Number(firstAt) > 0 ? Number(firstAt) : (Number(since) > 0 ? Number(since) : null) });
}

/** (b) THE VERDICT over ONE reading attributed to the row's credential slot.
 *  row     = { check: {state, since, gen}, anchor: rowAnchorOf(…) | null, lost: rowLostOf(…), orgUuid, others: [{id,
 *            window}] (identity groups already collapsed, non-account keys already dropped — the orchestrator's rowOf),
 *            run: [suspects] }
 *  reading = { window, orgUuid, at, viaToken (true · false · null = the road is unknown), gen, eligible: {ok, why} }
 *  → { verdict, why, on?, fp?, via?, others?, run?, entry? } — POST_CHECK_VERDICTS:
 *    idle          nothing armed (no token, or already judged)
 *    late          older than LATE_MS (2 min — the record-lateness law), or produced before the token was saved
 *    not-the-token the slot was not spending the token (the row's own login) — says nothing about it
 *    stale-token   the conversation runs on ANOTHER generation of the row's token (the previous one), or its
 *                  generation cannot be vouched for (F1) — says nothing about the token saved now; `road: 'unknown'` =
 *                  its very ROAD is not a fact we hold (restored from a record older than the road stamp — fix r3 F-R1):
 *                  it cannot say token or login, so it says nothing (and is no witness's producer either)
 *    ineligible    not a witness reading (`apiWitnessEligibility` said no: a re-point inside the horizon, a
 *                  shadowed or unvalidated slot — F2) — the hot switch's in-flight reading never judges
 *    no-evidence   no weekly window (and no differing org), or no weekly bucket in common with the anchor
 *    no-anchor     the row knows no identity yet and no other row's window matches — stays armed
 *    lost          the row HAD a window stamp, nothing about it can say who produced it any more (identityLost) and no other
 *                  row's window matches — the owner is asked ONCE (the anchor ask, 「身份未验证」), never a mark (fix r3)
 *    hint          no anchor, and ANOTHER row's window matches: the owner is asked ONCE — never a mark (F4)
 *    suspect       it differs from the row's anchor (or its org does), short of K agreeing readings (F2)
 *    confirmed     the weekly phase agrees with the row's anchor (the org, when both state one, too)
 *    moved         K consecutive eligible readings agree on ONE phase no other account's identity holds: the row's own
 *                  window may have moved (a renewal, a plan change) or the token is an account outside the roster —
 *                  the owner is asked (the `anchor` ask), never a mark (fix r2 F-C)
 *    mismatch      K consecutive eligible readings agree on ONE phase (or org) that is not the row's and that ANOTHER
 *                  account's identity holds (`others` = identities, groups collapsed)
 *  The caller acts on `confirmed` / `mismatch` / `moved` / `hint` / `suspect` only; every other verdict leaves the check armed. */
function identityPostCheck(row, reading, { now = 0, k = MISMATCH_RUN } = {}) {
  if (!row || !row.check || row.check.state !== 'pending') return { verdict: 'idle', why: 'no check armed' };
  if (!reading) return { verdict: 'no-evidence', why: 'no reading' };
  const at = Number(reading.at), since = Number(row.check.since) || 0;
  if (Number.isFinite(at) && at > 0 && Number(now) - at > LATE_MS) return { verdict: 'late', why: `the reading is ${Math.round((Number(now) - at) / 1000)} s old — a late record is not a live fact` };
  if (Number.isFinite(at) && at > 0 && at < since) return { verdict: 'late', why: 'the reading was produced before the token was saved' };
  if (reading.viaToken === null) return { verdict: 'stale-token', road: 'unknown', why: 'the conversation\'s road is unknown (restored from a record that never said whether it runs on the token or on the login) — it says nothing about the token' };
  if (reading.viaToken !== true) return { verdict: 'not-the-token', why: 'the slot was not spending the token (the row\'s own login) — it says nothing about the token' };
  // F1 THE TOKEN'S GENERATION: only a conversation on the token saved NOW judges it
  const gen = Number(row.check.gen) > 0 ? Number(row.check.gen) : null;
  const rGen = Number(reading.gen) > 0 ? Number(reading.gen) : null;
  if (gen == null || rGen == null) return { verdict: 'stale-token', why: 'the conversation\'s token generation cannot be vouched for (a session restored without its spawn stamp, a token file rewritten inside the turn) — it says nothing about the token saved now' };
  if (rGen !== gen) return { verdict: 'stale-token', why: `the conversation runs on ${rGen < gen ? 'the PREVIOUS' : 'another'} token of this row — it says nothing about the one saved now` };
  // F2 THE WITNESS RULE: the reading must be one the slot's own API ring would take
  const el = reading.eligible;
  if (!(el === true || (el && el.ok === true))) return { verdict: 'ineligible', why: `not a witness reading: ${(el && el.why) || 'eligibility unknown'}` };
  const rOrg = low(reading.orgUuid), aOrg = low(row.orgUuid) || (row.anchor ? low(row.anchor.orgUuid) : null);
  const win = hasWeekly(reading.window) ? weeklyOf(reading.window) : null;
  const fp = win ? windowFingerprint(win) : null;
  const others = win ? [...new Set((Array.isArray(row.others) ? row.others : []).filter((o) => o && o.id && hasWeekly(o.window) && compareWindows(win, weeklyOf(o.window)) === 'agree').map((o) => String(o.id)))] : [];
  const entry = { sevenDay: win ? win.sevenDay : null, scoped: win ? { ...win.scoped } : {}, ...(rOrg ? { orgUuid: rOrg } : {}), at: Number.isFinite(at) && at > 0 ? at : Number(now) || 0 };
  // THE K-RUN (F2): one disagreeing reading is a suspect; K consecutive ones agreeing on ONE phase (or org) are the mismatch
  const same = (a, b) => (hasWeekly(a) && hasWeekly(b) ? compareWindows(weeklyOf(a), weeklyOf(b)) === 'agree' : (!!low(a.orgUuid) && low(a.orgUuid) === low(b.orgUuid)));
  const suspect = (on, via, why) => {
    const prev = Array.isArray(row.run) ? row.run.filter((x) => x && typeof x === 'object') : [];
    let n = 1;
    for (let i = prev.length - 1; i >= 0 && same(entry, prev[i]); i--) n++;
    if (n >= k && !others.length) return { verdict: 'moved', on, fp, via, others, run: n, entry, why: `${why} — ${n} consecutive eligible readings agree on a window no other account's identity holds (a renewal, a plan change, or an account outside the roster): the owner is asked, never a mark` };
    if (n >= k) return { verdict: 'mismatch', on, fp, via, others, run: n, entry, why: `${why} — ${n} consecutive eligible readings agree` };
    return { verdict: 'suspect', on, fp, via, others, run: n, k, entry, why: `${why} — ${n} of ${k} readings` };
  };
  if (rOrg && aOrg && rOrg !== aOrg) return suspect('org', row.anchor ? row.anchor.via : 'org', 'the reading\'s org differs from the row\'s');
  if (!win) return { verdict: 'no-evidence', why: 'the reading states no weekly window' };
  if (row.anchor && hasWeekly(row.anchor.window)) {
    const c = compareWindows(win, weeklyOf(row.anchor.window));
    if (c === 'agree') return { verdict: 'confirmed', on: 'window', fp, via: row.anchor.via };
    if (c === 'differ') return suspect('window', row.anchor.via, `the token's weekly window ${fp} differs from the row's ${row.anchor.fp || windowFingerprint(weeklyOf(row.anchor.window))} (${row.anchor.via})`);
    return { verdict: 'no-evidence', fp, why: 'no weekly bucket in common with the row\'s anchor' };
  }
  if (others.length) return { verdict: 'hint', on: 'window', fp, via: 'another-row', others, entry, why: `the token's weekly window ${fp} is another row's — the row has no identity of its own to judge by, so the owner is asked` };
  if (row.lost) return { verdict: 'lost', on: 'window', fp, entry, why: 'the row\'s window stamp can no longer say who produced it (written after its first token by a writer that could not tell) and nothing else proves the row\'s identity — the owner is asked, never a mark' };
  return { verdict: 'no-anchor', fp, why: 'the row has no identity anchor yet and no other row holds this window' };
}

/** What the roster says of a row's token identity: 'mismatch' · 'hint' / 'anchor' / 'lost' (an open ask — `lost` = the
 *  anchor ask of a row whose identity was lost, fix r3) · 'confirmed' · 'unknown-road' (a conversation whose road is
 *  unknown read the token — `stale-token`, `road: 'unknown'`: it judged nothing; its next spawn records the road, fix r3) · 'unverified' (armed, never
 *  judged, > UNVERIFIED_MS — F8 — counted from the ARM: the save, or the re-arm of a check judged before, fix r2 L3) ·
 *  null (armed and young: nothing to say yet). */
function identityRowState(check, now = 0) {
  if (!check || typeof check !== 'object') return null;
  if (check.state === 'mismatch') return 'mismatch';
  if (check.ask && ASK_KINDS.includes(check.ask.kind)) return check.ask.lost === true && check.ask.kind === 'anchor' ? 'lost' : check.ask.kind;
  if (check.state === 'confirmed') return 'confirmed';
  if (check.state === 'pending' && check.unknownRoad && Number(check.unknownRoad.at) > 0) return 'unknown-road';
  if (check.state === 'pending' && Number(now) - Number(check.armedAt || check.since) > UNVERIFIED_MS) return 'unverified';
  return null;
}

/** THE OWNER'S ANSWER to an open ask (a hint / an anchor ask — fix r2 L2: an answer with no ask is refused by name): 'mine' ⇒ the window the token's readings stated becomes
 *  the row's owner-confirmed anchor and the check is confirmed; 'not-mine' ⇒ the mark (the placement stop).
 *  → {ok, act: 'confirm'|'mark', anchor?, others?} | {ok: false, code, why} */
function ownerAnswerVerdict(check, answer) {
  if (!check || typeof check !== 'object') return { ok: false, code: 'no_check', why: 'this row holds no long-lived token' };
  if (answer !== 'mine' && answer !== 'not-mine') return { ok: false, code: 'bad_answer', why: 'answer mine or not-mine' };
  if (answer === 'mine') {
    // only an open ASK is answered 'mine' — a mark (K readings against the row's anchor) is undone by the owner's act on
    // the token (re-mint / re-bind / remove), never by one click
    const w = check.ask && check.ask.win ? check.ask.win : null;
    if (!w || !hasWeekly(w)) return { ok: false, code: 'nothing_to_confirm', why: check.state === 'mismatch' ? 'this token is marked as another account\'s — re-mint it, re-bind it or remove it' : 'no reading of this token has stated a weekly window yet — there is nothing to confirm; re-bind or re-mint it instead' };
    const ww = weeklyOf(w);
    return { ok: true, act: 'confirm', anchor: { sevenDay: ww.sevenDay, scoped: ww.scoped, how: 'owner-confirmed', fp: windowFingerprint(ww) } };
  }
  if (check.state === 'mismatch') return { ok: false, code: 'already_marked', why: 'this token is already marked as another account\'s' };
  if (!check.ask) return { ok: false, code: 'nothing_to_answer', why: 'nothing about this token is waiting for an answer — re-bind it or remove it instead' };
  return { ok: true, act: 'mark', others: (check.ask && Array.isArray(check.ask.others) ? check.ask.others : []).filter((x) => typeof x === 'string' && x) };
}

module.exports = { CHECK_STATES, POST_CHECK_VERDICTS, ANCHOR_HOWS, ASK_KINDS, MISMATCH_RUN, UNVERIFIED_MS, hasWeekly, weeklyOf, anchorMoved, anchorFromProbe, anchorWriteVerdict, probeAgainstAnchor, stampProducer, stampIsIdentity, isIdentityAnchor, identityCarry, identityOf, identityLost, identityWindows, rowAnchorOf, rowLostOf, identityPostCheck, identityRowState, ownerAnswerVerdict };
