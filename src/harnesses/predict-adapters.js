'use strict';
// THE PREDICTION ADAPTERS BY SOURCE (lane usage-predict pick 3, 2026-11-15): each account source's adapter — its unit, its
// prior — reachable by the estimator's core (src/usage-predict.js) WITHOUT loading the harness registry (~50 ms, paid by every
// suite that builds an estimator). THE HUB'S ONE MODULE for them (主开发 2026-11-17: the device agent carries no code it never
// runs): a descriptor NAMES its adapter (claude-quota.js 'claude', codex-quota.js 'codex', antigravity.js 'antigravity'), the
// registry checks the name's shape, and checkRegistry below resolves each built-in name here at the hub's boot
// (src/server/harness-config-sync.js create).
// Nothing on the device requires this file (test-architecture §107). A source with no quota has no row (shell, opencode:
// `predict: { none }` on NULL_QUOTA).
const ADAPTERS = Object.freeze({
  claude: () => require('./claude-predict.js'),
  codex: () => require('./codex-predict.js'),
  antigravity: () => require('./antigravity-predict.js'),
});
/** A source's adapter, or null. */
function adapterOf(source) { const f = Object.prototype.hasOwnProperty.call(ADAPTERS, source) ? ADAPTERS[source] : null; return f ? f() : null; }
/** THE HUB'S CHECK of descriptors' `quota.predict` → the errors (empty = good): a NAME must resolve here to an adapter that keeps
 *  its contract (src/usage-predict.js checkPredict); `{ none }` stands (the registry checked its why). */
function checkRegistry(descriptors) {
  const { checkPredict } = require('../usage-predict.js');
  const errs = [];
  for (const h of descriptors || []) {
    const p = h && h.quota && h.quota.predict;
    if (typeof p !== 'string') continue;
    const a = adapterOf(p);
    if (!a) { errs.push(`${h.id}: quota.predict names '${p}', which no hub adapter answers`); continue; }
    for (const e of checkPredict(a)) errs.push(`${h.id}: the '${p}' adapter — ${e}`);
  }
  return errs;
}
module.exports = { ADAPTERS, adapterOf, checkRegistry };
