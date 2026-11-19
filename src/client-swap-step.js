'use strict';
// PURE (imports nothing) — THE CLIENT-SWAP RULE, ONE for every place a company preset's OAuth client is replaced under its key:
// the channel accounts (src/server/channels-engine.js clientSwapCheck, B-166e part 2) and the Drive / Gmail storage mounts
// (src/mounts.js clientSwapCheck → src/server/mount-for-you.js clientSwaps, B-e40d). Moved here verbatim from the channel
// engine (which still exports it); its table: scripts/test-channels-gmail-shape.mjs ㉗ (1c).

/** B-166e part 2 (主开发 2026-11-19 00:42Z, the shape ruled): A PRESET'S CLIENT-SWAP MEMO IS WHAT WAS SAID — the client in force
 *  at the last check (`to`), the accounts NAMED in an item for that client (`named`), whether that item is open (`open`). PURE:
 *  (the memo, the client in force, the COUNTED accounts not on it) → the memo after and the one act:
 *   1. the client in force differs from the memo's: a NEW SWAP — the memo starts again for this client with nobody named (an
 *      item still open for the old client is superseded);
 *   2. owed = those not on the client in force who are not yet named: if any, ONE item — the open one redrawn, else a new one —
 *      listing ALL who must act now, and they are named;
 *   3. nobody left to act and the item open: it closes; the named stay named.
 *  So a swap is said once however many it touches; one already named who comes back is not said twice; one never named
 *  (disabled or dead AT the swap) is said once when back; a revert is simply a new swap. → { memo, act, supersede } with act
 *  'file' | 'redraw' | 'close' | 'none'. */
function clientSwapStep(memo, to, need) {
  const same = !!memo && memo.to === to;
  const m = { to, named: same && Array.isArray(memo.named) ? [...new Set(memo.named.map(String))] : [], open: same ? memo.open === true : false };
  const supersede = !same && !!(memo && memo.open === true);
  const ids = [...new Set((need || []).map(String))];
  const owed = ids.filter((id) => !m.named.includes(id));
  let act = 'none';
  if (owed.length) { act = m.open ? 'redraw' : 'file'; for (const id of owed) m.named.push(id); m.open = true; }
  else if (ids.length && m.open) act = 'redraw';   // the open item follows who must act now (one fewer: re-authorized)
  else if (!ids.length && m.open) { act = 'close'; m.open = false; }
  m.named.sort();
  return { memo: m, act, supersede };
}

module.exports = { clientSwapStep };
