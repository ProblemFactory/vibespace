// pool-pin-carrier.js — B-2083's carrier follow (lane lg-rewind, 主开发 r5180 / r5363 / r5367). PURE (no DOM, no socket, no clock).
// THE PAGE TAKES THE LIVE PIN INTO ITS RESUME CARRIER: a conversation's pool pin lives on the hub while the conversation runs (the
// record + the session meta) and, for a resume after it ends, in the page's own carrier (user-state sessionConfigs[key].poolPin,
// which src/lib/session-lifecycle.js resumeSession hands to the create). Until now only this page's own press wrote the carrier, so a
// pin made elsewhere (an automation key's conversations.pin, another page or device) was lost at a person's resume after the end.
// carrierPatches reads the 'active-sessions' rows the sidebar already receives and answers the carrier writes they call for:
//   · a LIVE local row that bills a pool: its pin {memberId, at} becomes the carrier {memberId, at, poolId: the row's pool}; a row
//     with no pin clears a carrier pin made on THAT pool (a pin made on another pool stays: a pin applies only to its own pool).
//   · only when DIFFERENT (several open pages converge on one value; a 5 s list costs one compare a row) and only on an EDGE: a
//     row whose pin fact is the one this page saw for it in the previous list writes nothing — an older list repeating an old fact
//     never undoes an act another page made in between (the multi-client law: an act never waits for, nor is undone by, an older
//     echo). The first list after a load is an edge (the hub's current state).
//   · THIS PAGE's OWN PRESS IS A FENCE (主开发 r5367's guard): from the press's send until a list carries its result (the pin's
//     member, or no pin for «Back to automatic»), every other fact for that conversation is an OLDER echo (the hub sends the list
//     that carries an act before it answers the press, on the same ordered socket) and writes nothing. A refused press lifts it. No
//     timer: a fence whose carrying list never came (a dropped socket) keeps the page's own act until the next press or a reload.
//   · never touched: a stopped conversation's carrier (it has no live row: a pin pressed while stopped rides its next resume), a
//     remote row (never pinned), a row that bills no pool, a row with no conversation id yet.
// A KEY's pin is judged by the money law when it is made (src/automation-keys.js pinMoneyVerdict); after that it is what any live
// pin is — the carrier keeps it as it was made (no `by`), as a person's pin.
// Gate: scripts/test-pool-pin-carrier.mjs.

/** A row's pin fact → `<memberId>#<at>` (its signature) | '-' (no pin). */
export const pinSigOf = (pin) => (pin && typeof pin.memberId === 'string' && pin.memberId ? `${pin.memberId}#${Number(pin.at) || 0}` : '-');
/** Is this 'active-sessions' row one whose pin the carrier follows? (live, local, billing a pool, with its conversation key) */
export const followsPin = (row) => !!(row && typeof row.sessionKey === 'string' && row.sessionKey && !row.host && row.accountId && row.auth && row.auth.source === 'pooled');
/** Does a list's pin fact carry the press's result? `want` = the member pressed, or null («Back to automatic»). */
export const carriesPress = (want, pin) => (want == null ? pinSigOf(pin) === '-' : !!(pin && pin.memberId === want));

/**
 * The carrier writes ONE list calls for.
 * @param {object[]} rows     the 'active-sessions' rows
 * @param {object} o
 * @param {(key: string) => object|null} o.configOf   the carrier as it stands (the sidebar's getSessionConfig)
 * @param {Map<string,string>} [o.seen]               each followed conversation's pin signature in the PREVIOUS list
 * @param {Map<string,string|null>} [o.fences]        this page's own presses not yet carried: key → the member pressed | null
 * → { patches: [[key, {poolPin}]], seen: Map (this list's), lifted: [key] (fences this list carries) }
 */
export function carrierPatches(rows, { configOf, seen = new Map(), fences = new Map() } = {}) {
  const patches = [], lifted = [], now = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!followsPin(row)) continue;
    const key = row.sessionKey, pin = row.poolPin && typeof row.poolPin === 'object' ? row.poolPin : null, sig = pinSigOf(pin);
    now.set(key, sig);
    if (fences.has(key)) { if (carriesPress(fences.get(key), pin)) lifted.push(key); continue; }   // the press wrote the carrier itself
    if (seen.has(key) && seen.get(key) === sig) continue;   // no edge: an older list repeating what this page already saw
    const cfg = (typeof configOf === 'function' ? configOf(key) : null) || null;
    const c = cfg && cfg.poolPin && typeof cfg.poolPin === 'object' && typeof cfg.poolPin.memberId === 'string' && cfg.poolPin.memberId ? cfg.poolPin : null;
    if (sig !== '-') {
      if (c && c.memberId === pin.memberId && (Number(c.at) || 0) === (Number(pin.at) || 0) && c.poolId === row.accountId) continue;   // equal
      patches.push([key, { poolPin: { memberId: pin.memberId, at: Number(pin.at) || null, poolId: row.accountId } }]);
    } else if (c && (!c.poolId || c.poolId === row.accountId)) patches.push([key, { poolPin: null }]);   // cleared on this pool
  }
  return { patches, seen: now, lifted };
}
