'use strict';
// CODEX'S PREDICTION ADAPTER (lane usage-predict pick 3, 2026-11-15): no prior — a codex plan's full-quota size was never
// measured, so its rate is learned from its own pairs before anything is projected. PURE data; the descriptor carries it as
// `quota.predict` (src/harnesses/codex-quota.js). Its unit is the ledger's API-equivalent USD today; learning in its own
// tokens is the next pick (usage-predict pick 4, with usage-every-change's codex walker rows).
module.exports = Object.freeze({
  source: 'codex',
  unit: 'usd-api',
  prior: Object.freeze({ none: 'learn first: no full-quota size of a codex plan was ever measured' }),
});
