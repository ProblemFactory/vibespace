'use strict';
// THE PREDICTION ADAPTERS BY SOURCE (lane usage-predict pick 3, 2026-11-15): each account source's `quota.predict` — its unit,
// its prior — reachable by the estimator's core (src/usage-predict.js) WITHOUT loading the harness registry (~50 ms, paid by
// every suite that builds an estimator). The descriptors carry the very same objects (claude-quota.js, codex-quota.js,
// antigravity.js); test-harness-contract holds the two bindings equal. A source with no quota has no row (shell, opencode:
// `predict: { none }` on NULL_QUOTA).
const ADAPTERS = Object.freeze({
  claude: () => require('./claude-predict.js'),
  codex: () => require('./codex-predict.js'),
  antigravity: () => require('./antigravity-predict.js'),
});
/** A source's adapter, or null. */
function adapterOf(source) { const f = Object.prototype.hasOwnProperty.call(ADAPTERS, source) ? ADAPTERS[source] : null; return f ? f() : null; }
module.exports = { ADAPTERS, adapterOf };
