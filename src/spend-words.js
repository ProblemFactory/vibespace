'use strict';
// THE ONE DOOR (B-ef83 unit 2, 主开发 r4696): a spend verdict's words for ANY caller that is not a person.
// A verdict the gate could not judge (src/spend-authorizer.js HELD_WHYS, `isHeldWhy`) can carry a detail that names ANOTHER
// process's id and its host (a ledger another VibeSpace keeps). Every road that answers an agent, a key holder or a stored record
// an agent reads takes its words HERE: a held verdict becomes «the spend gate could not judge (CODE)» — the code and the family,
// nothing else; any other verdict keeps its detail, as before. The person's own pages (the guard's notice, the reset-credit press,
// the bulk resume page, the wall card) keep the full detail and do not come here. scripts/test-spend-held-lift.mjs §12's census leg
// walks every file that asks the gate: a read of a verdict's detail beside this door is red.
const SA = require('./spend-authorizer.js');
/** → string | null (null: no verdict, or one with neither detail nor why) */
function agentSpendWords(v) {
  if (!v || typeof v !== 'object') return null;
  if (SA.isHeldWhy(v.why)) return `the spend gate could not judge (${v.why})`;
  const w = v.detail || v.why;
  return w ? String(w) : null;
}
module.exports = { agentSpendWords };
