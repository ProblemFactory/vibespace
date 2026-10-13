// THE JUDGE'S MONEY, LIVE (lane decision-spend-readout, owner 2026-10-13: 「看不到 decision api 花了多少钱了」).
//
// The words are ONE PURE line (src/decision-model.js decisionTodayLine); this file only reads the plugin's status
// (GET /api/plugins/decision-api/status — the engine's `today` + `month` + the cap) and PATCHES a drawn element in place:
// the same node keeps its place, only its text / title / red class move (never a re-render blink). The engine sends no
// usage broadcast, so a drawn line asks again every 60 s while it is on screen and stops once it is gone.
import * as DM from '../decision-model.js';
import { fetchJson } from './utils.js';
import { t } from './i18n.js';

export const READOUT_TICK_MS = 60000;

/** a plugin row (GET /api/plugins or …/status) → the PURE line, in the device's words. */
export function decisionLineOf(p) {
  const d = (p && p.decision) || {};
  return DM.decisionTodayLine(d.today, (Number(d.dailyBudgetCents) || 0) / 100, { on: !!(p && p.enabled), t, monthUsd: d.month ? d.month.usd : null });
}

/** paint `el` from line `L`: `pick` names the string (short | text | month), or a function L → string. */
export function paintDecisionLine(el, L, pick = 'text') {
  if (!el || !L) return;
  const s = typeof pick === 'function' ? pick(L) : L[pick];
  if (el.textContent !== s) el.textContent = s;
  if (el.title !== L.title) el.title = L.title;
  el.classList.toggle('is-near-cap', !!L.warn);
}

/** keep `el` live: `draw(L)` now (from `first`, a row already in hand) and on every tick while `el` is in the page. */
export function liveDecisionLine(el, draw, { first = null, tickMs = READOUT_TICK_MS } = {}) {
  const ask = () => fetchJson('/api/plugins/decision-api/status').then((p) => { if (p && !p.error) draw(decisionLineOf(p)); }).catch(() => { });
  if (first) draw(decisionLineOf(first)); else ask();
  const timer = setInterval(() => { if (el.isConnected) ask(); else clearInterval(timer); }, tickMs);   // a tick is long after the draw attached it
  return () => clearInterval(timer);
}
