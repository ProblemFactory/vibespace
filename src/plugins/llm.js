'use strict';
// THE LLM PLUGIN (lane decision-core, docs/design-decision-api.zh.md §2.7; its name and its one switch per feature: lane
// llm-plugin-rename, owner 2026-10-14) — the owner's own switch, then one switch per feature: the judge's four
// (attention | rules | routing | inbox — all OFF by default: each bills by itself) and the drafter's (`learn`, ON: a draft
// is the owner's own click), the judging model (`judgeModel` — empty = the cluster's / the provider's default), the daily
// budget in cents (default 100 = 1 USD) and the attention threshold. The provider and the key live on the registry row
// `llm` (one key box: the Integrations card); the ONE caller is src/server/decision-engine.js, which reads this record
// (and the text-model client through its ledger). The per-account "never judge" list lives with the channel account (D2).
const M = require('../decision-model.js');

function configPatch(cur, patch) {
  const next = { ...cur };
  for (const f of M.FEATURES) if (patch[f] !== undefined) next[f] = patch[f] === true;
  if (patch.learn !== undefined) next.learn = patch.learn === true;   // the drafter's switch (lane llm-plugin-rename)
  if (patch.judgeModel !== undefined) {   // the judging model (lane llm-plugin-rename) — '' = the preset's / the provider's default
    const m = String(patch.judgeModel ?? '').trim();
    if (m.length > 200 || /\s/.test(m)) throw new Error('the judging model is a model name: no spaces, at most 200 characters');
    next.judgeModel = m;
  }
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
  id: 'llm',
  label: 'LLM',
  description: 'Uses a language model through your OpenAI or OpenRouter key for the features you turn on in its settings: picking out the messages that need you, notification rules written as a sentence, handing messages out by what they say, the For-you order, and drafting “What matters to me”. It never spends more per day than the limit you set.',
  provides: ['decision', 'text-model'],
  create(h) {
    const eng = h.opts.decisionEngine || null;
    // lane plugin-settings-p0: the switches, budget and threshold are SETTINGS rows (src/plugin-settings.js — All
    // Settings › Plugins › LLM), never data/plugins.json; the budget row is USD, the engine counts cents
    const cfg = () => {
      const v = h.settings();
      const usd = Number(v.dailyBudgetUsd);
      const th = Number(v.threshold);
      return { ...Object.fromEntries(M.FEATURES.map((f) => [f, v[f] === true])), dailyBudgetCents: Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 100) : M.DAILY_BUDGET_CENTS_DEFAULT, threshold: Number.isFinite(th) ? th : M.THRESHOLD_DEFAULT,
        learnModel: v.learnModel === 'sonnet' ? 'sonnet' : 'flash',   // lane rule-learning: the tier that drafts 「我关心什么」
        learn: v.learn !== false,   // lane llm-plugin-rename: the drafter's own switch (ON by default — a draft is the owner's click)
        judgeModel: typeof v.judgeModel === 'string' ? v.judgeModel.trim() : '' };   // the judging model ('' = the cluster's / the provider's default)
    };
    if (eng) eng.attachPlugin({ peek: h.peek, settings: cfg });
    return {
      install: async () => ({ ok: true }),
      start: () => ({ ok: true }),
      stop: () => ({ ok: true }),
      status: () => {
        const on = !!h.peek().enabled;
        const s = eng ? eng.status() : null;
        // lane decision-vendor-hygiene: `why` names the row stop that holds (reconnect | plan | shape) — null while calls may go out
        return { installed: true, running: on, enabled: on, configured: !!(s && s.configured), why: s && s.stop ? s.stop.why : null, decision: { ...(s || {}), ...cfg() } };
      },
      // the old /config door (an agent or a script): validated, then written through the settings rows
      config: (patch = {}) => {
        const next = configPatch(cfg(), patch || {});
        h.writeSettings({ ...Object.fromEntries(M.FEATURES.map((f) => [f, next[f]])), learn: next.learn, judgeModel: next.judgeModel, dailyBudgetUsd: next.dailyBudgetCents / 100, threshold: next.threshold });
        h.notify();
        if (eng) eng.inboxSwitched(); // lane inbox-decision-group: the For-you tray redraws its sections now, not at the next tick
        return { ok: true, config: cfg() };
      },
    };
  },
  configPatch,
};
