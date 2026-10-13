'use strict';
// THE DECISION API PLUGIN (lane decision-core, docs/design-decision-api.zh.md §2.7) — the owner's own switch,
// the feature toggles (attention | rules | routing | inbox — all OFF by default), the daily budget in cents (default 100 =
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
  description: 'Sends the messages in your channels to a model (OpenAI or OpenRouter) that answers yes/no questions for you, like “do I need to look at this now?”. It never spends more per day than the limit you set.',
  provides: ['decision'],
  create(h) {
    const eng = h.opts.decisionEngine || null;
    // lane plugin-settings-p0: the switches, budget and threshold are SETTINGS rows (src/plugin-settings.js — All
    // Settings › Plugins › Decision API), never data/plugins.json; the budget row is USD, the engine counts cents
    const cfg = () => {
      const v = h.settings();
      const usd = Number(v.dailyBudgetUsd);
      const th = Number(v.threshold);
      return { ...Object.fromEntries(M.FEATURES.map((f) => [f, v[f] === true])), dailyBudgetCents: Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 100) : M.DAILY_BUDGET_CENTS_DEFAULT, threshold: Number.isFinite(th) ? th : M.THRESHOLD_DEFAULT };
    };
    if (eng) eng.attachPlugin({ peek: h.peek, settings: cfg });
    return {
      install: async () => ({ ok: true }),
      start: () => ({ ok: true }),
      stop: () => ({ ok: true }),
      status: () => {
        const on = !!h.peek().enabled;
        const s = eng ? eng.status() : null;
        return { installed: true, running: on, enabled: on, configured: !!(s && s.configured), decision: { ...(s || {}), ...cfg() } };
      },
      // the old /config door (an agent or a script): validated, then written through the settings rows
      config: (patch = {}) => {
        const next = configPatch(cfg(), patch || {});
        h.writeSettings({ ...Object.fromEntries(M.FEATURES.map((f) => [f, next[f]])), dailyBudgetUsd: next.dailyBudgetCents / 100, threshold: next.threshold });
        h.notify();
        if (eng) eng.inboxSwitched(); // lane inbox-decision-group: the For-you tray redraws its sections now, not at the next tick
        return { ok: true, config: cfg() };
      },
    };
  },
  configPatch,
};
