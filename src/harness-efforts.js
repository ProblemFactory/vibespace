/**
 * THE EFFORT ROWS OF ONE HARNESS (lane effort-menu-per-harness, 2026-10-21) — PURE.
 *
 * The owner, on an Antigravity conversation's status bar: the effort menu offered Default / low … max / ultracode —
 * «antigravity 也是这几个档位吗？». GET /api/session-options answered ONE list made for claude (the claude CLI's parsed
 * --effort levels + claude's declared ultracode) to every backend, and the bar's `??` fallback to the harness's own row
 * never fired because claude's extras were always there. agy --effort takes low|medium|high|xhigh|max; a picked
 * ultracode was dropped without a word.
 *
 * A harness's choices are the harness's rows, answered per backend (`?backend=<id>`):
 *   ui.effortLevels   an array          ⇒ those levels (antigravity: AGY_EFFORTS, src/adapters/agy.js — the one place)
 *                     'cli-help'        ⇒ the CLI's parsed --effort levels (claude; src/server/cli-env.js parses them)
 *                     'model-catalog'   ⇒ the asked model's catalog levels, else the catalog's union (codex)
 *                     null              ⇒ NO effort menu (opencode, an unknown harness)
 *   ui.effortExtras   the harness's OWN extra rows (claude ultracode), gated on the level each spawns as — else [].
 */
'use strict';

const RANK = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const byRank = (a, b) => (RANK.indexOf(a) + 1 || 99) - (RANK.indexOf(b) + 1 || 99);

// A declared extra rides only when the CLI parsed the level it spawns as
// (ultracode = `--effort xhigh` + the ultracode settings key; the key is in the
// 2.1.281–2.1.288 binaries, gated CLI-side on an xhigh-capable model) — a CLI
// without that level ⇒ the row is ABSENT by name, never a no-op pick.
function effortExtrasFor(declared, levels) {
  return (declared || []).filter((x) => !x.requiresLevel || (levels || []).includes(x.requiresLevel))
    .map(({ value, label, hint }) => ({ value, label, hint }));
}

/** The levels one harness's CLI really takes, or null (no effort menu). */
function effortLevelsOf(ui, { cliLevels = [], catalogModels = [], model = '' } = {}) {
  const decl = ui?.effortLevels;
  if (Array.isArray(decl)) return decl.map(String);
  if (decl === 'cli-help') return (cliLevels || []).map(String).filter(Boolean);
  if (decl === 'model-catalog') {
    const models = (catalogModels || []).filter((m) => m && m.id);
    const cur = models.find((m) => m.id === model);
    const lv = cur?.efforts?.length ? cur.efforts : [...new Set(models.flatMap((m) => m.efforts || []))];
    return lv.map(String).filter(Boolean).sort(byRank);
  }
  return null;
}

/** { effortLevels, effortExtras } of ONE harness — never another harness's extras. */
function effortAnswerFor(harness, ctx = {}) {
  const levels = effortLevelsOf(harness?.ui, ctx);
  return { effortLevels: levels, effortExtras: levels ? effortExtrasFor(harness?.ui?.effortExtras, levels) : [] };
}

/** THE /api/session-options ANSWER. An ask without a backend is the old (claude) ask; an unknown backend has no menu.
 *  permissionModes stays the claude CLI's parsed --permission-mode choices (the dialog applies them to claude only). */
function sessionOptionsAnswer(query, { harnessOf, cliLevels, permissionModes, catalog } = {}) {
  const backend = String(query?.backend || 'claude');
  let harness = null;
  try { harness = harnessOf ? harnessOf(backend) : null; } catch { harness = null; }
  const model = String(query?.model || '');
  return { backend, ...effortAnswerFor(harness, { cliLevels, catalogModels: catalog?.[backend] || [], model }), permissionModes: permissionModes || [] };
}

module.exports = { effortExtrasFor, effortLevelsOf, effortAnswerFor, sessionOptionsAnswer };
