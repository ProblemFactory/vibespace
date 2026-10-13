'use strict';
// THE DECISION API PLUGIN (lane decision-core, docs/design-decision-api.zh.md §2.7) — the owner's own switch,
// the feature toggles (attention | rules | routing — all OFF by default), the daily budget in cents (default 100 =
// 1 USD) and the attention threshold. The provider, model and key live on the registry row `decision-api` (one
// key box: the Integrations card); the ONE caller is src/server/decision-engine.js, which reads this record.
// The per-account "never judge" list lives with the channel account (D2).
const M = require('../decision-model.js');

function configPatch(cur, patch) {
  const next = { ...cur };
  for (const f of M.FEATURES) if (patch[f] !== undefined) next[f] = patch[f] === true;
  if (patch.dailyBudgetCents !== undefined) {
    const c = Number(patch.dailyBudgetCents);
    if (!Number.isInteger(c) || c < 0 || c > 100000) throw new Error('the daily budget is a whole number of cents from 0 to 100000');
    next.dailyBudgetCents = c;
  }
  if (patch.threshold !== undefined) {
    const t = Number(patch.threshold);
    if (!(t >= M.THRESHOLD_RANGE[0] && t <= M.THRESHOLD_RANGE[1])) throw new Error(`the threshold is between ${M.THRESHOLD_RANGE[0]} and ${M.THRESHOLD_RANGE[1]}`);
    next.threshold = t;
  }
  return next;
}

module.exports = {
  id: 'decision-api',
  label: 'Decision API',
  description: 'Lets VibeSpace judge records for you with a decisions API (OpenAI or OpenRouter) — within a daily budget you set.',
  provides: ['decision'],
  create(h) {
    const eng = h.opts.decisionEngine || null;
    if (eng) eng.attachPlugin({ peek: h.peek });
    const cfg = () => ({ ...Object.fromEntries(M.FEATURES.map((f) => [f, false])), dailyBudgetCents: M.DAILY_BUDGET_CENTS_DEFAULT, threshold: M.THRESHOLD_DEFAULT, ...(h.peek().config || {}) });
    return {
      install: async () => ({ ok: true }),
      start: () => ({ ok: true }),
      stop: () => ({ ok: true }),
      status: () => {
        const on = !!h.peek().enabled;
        const s = eng ? eng.status() : null;
        return { installed: true, running: on, enabled: on, configured: !!(s && s.configured), decision: { ...(s || {}), ...cfg() } };
      },
      config: (patch = {}) => {
        const rec = h.rec();
        rec.config = configPatch(cfg(), patch || {});
        h.save(); h.notify();
        return { ok: true, config: rec.config };
      },
    };
  },
  configPatch,
};
