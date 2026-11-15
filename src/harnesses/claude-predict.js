'use strict';
// CLAUDE'S PREDICTION ADAPTER (lane usage-predict pick 3, 2026-11-15; the owner's ruling 2026-11-14 «A同时加入预测系统 把预测系统做成
// 通用的adapter接在不同的账号来源上»). The facts the estimator's core (src/usage-estimator.js) used to hold for EVERY identity are
// Claude's alone: they live here. PURE data. The descriptor carries it as `quota.predict` (src/harnesses/claude-quota.js); the
// core reaches it by source (src/usage-predict.js adapterOf) without loading the harness registry.
module.exports = Object.freeze({
  source: 'claude',
  unit: 'usd-api',   // a burn is the ledger's API-equivalent USD at today's price table
  // Measured Max-20x full-quota sizes in API-equivalent USD: each lane's prior pseudo-observation of its rate, and the scale
  // the pair filter judges an uncorroborated jump by (a Δu whose ledger cost is under 20 % of what this size says it costs)
  prior: Object.freeze({
    fiveHour: 500, sevenDay: 1730, 'scoped:fable': 875,
    // 5h TOKEN-CLASS priors (B-536b; 3-class since 2.268.1): the 5h lane weights each token class differently from the $
    // pricing — cache WRITES burn ~half per $, cache READS are nearly free (real-data fit cw ~$443 / cr ~$2556 / fresh ~$185);
    // three pure-class pseudo-pairs seed the regression, real data dominates quickly
    classes5h: Object.freeze({ cw: 500, cr: 3000, fresh: 200 }),
  }),
});
