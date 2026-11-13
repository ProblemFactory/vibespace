'use strict';
// THE NAMES A PERSON READS FOR A CLAUDE SUBSCRIPTION, AND THE VALUES THE CLI READS (lane oat-add-door, 2.369.399 — the owner,
// 2026-11-13: an account added by its long-lived token may say its subscription type, «登录一次（推荐）» first, «我自己选»
// second; «订阅在改名»). PURE: reads nothing; the scope grammar is cli-caps' (one spelling).
//
// THE TABLE IS DATED: the names are the vendor's as of PLAN_NAMES_AT (source: the vendor's pricing page, read 2026-11-13 —
// the Ultra button's link names `plan=max_20x`). A row is OFFERED only when the installed CLI carries its values
// (src/claude-plan-catalog.js reads them from the binary's bytes): the type, and the tier when the row has one. A value the CLI
// carries that no row names (team / enterprise on 2.1.321) is offered by its own id. Never offered: a free plan (no
// subscription), a withheld tier (`default_claude_zero` takes the CLI off the subscription road).
//
// The former names («原 Max 20x») are shown until FORMER_NAMES_UNTIL, then dropped.
//
// THE CHOICE IS THE PERSON'S STATEMENT: it writes the long-lived token's file with the scopes the CLI's own mint asks for
// (measured per CLI version — cli-caps mintScopesOf) and the chosen values. «不确定 — 先不选» (`unsure`) writes the scopes and
// NO type: nothing false is written for a person who does not know the plan; the CLI then runs with its default model for a
// typeless login (Sonnet on 2.1.321, measured). A later sign-in states the vendor's own shape and replaces the choice.
const PLAN_NAMES_AT = '2026-11-13';
const FORMER_NAMES_UNTIL = Date.UTC(2027, 10, 13); // 2027-11-13
const PLAN_ROWS = Object.freeze([
  Object.freeze({ id: 'ultra', name: 'Ultra', formerly: 'Max 20x', type: 'max', tier: 'default_claude_max_20x' }),
  Object.freeze({ id: 'max', name: 'Max', formerly: 'Max 5x', type: 'max', tier: 'default_claude_max_5x' }),
  Object.freeze({ id: 'pro', name: 'Pro', formerly: null, type: 'pro', tier: null }),
]);
const { scopesOk } = require('./cli-caps.js');

const UNSURE = 'unsure';
const TYPE_ID = /^type:([a-z0-9_]{1,40})$/;

const strings = (xs) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string' && x) : []);

/** The way-② choices for this CLI, in the order the person reads them → [{choice, type, tier, name, formerly}] — the table's rows
 *  the CLI carries, then the CLI's other types by their ids, then «先不选» LAST. [] (way ② not offered — «登录一次» alone) when
 *  the CLI's mint scopes were not measured or its bytes carry no type. `catalog` = claude-plan-catalog's result. */
function planChoices(catalog, { scopes = null, now = Date.now() } = {}) {
  const c = catalog && typeof catalog === 'object' ? catalog : {};
  const types = strings(c.types), tiers = strings(c.tiers);
  if (!scopesOk(scopes) || !types.length) return [];
  const former = Number(now) < FORMER_NAMES_UNTIL;
  const out = [];
  for (const r of PLAN_ROWS) {
    if (!types.includes(r.type) || (r.tier && !tiers.includes(r.tier))) continue;
    out.push({ choice: r.id, type: r.type, tier: r.tier, name: r.name, formerly: former ? r.formerly : null });
  }
  const named = new Set(PLAN_ROWS.map((r) => r.type));
  for (const t of types) if (!named.has(t)) out.push({ choice: 'type:' + t, type: t, tier: null, name: t, formerly: null });
  if (!out.length) return [];
  out.push({ choice: UNSURE, type: null, tier: null, name: null, formerly: null });
  return out;
}

/** The shape a choice writes → {scopes, subscriptionType?, rateLimitTier?, typeless?} or null (refused: a choice this CLI does
 *  not offer, or no measured scopes). The shape names only what the person chose — never a guessed tier. */
function choiceShape(choice, catalog, { scopes = null, now = Date.now() } = {}) {
  const sc = scopesOk(scopes);
  if (!sc) return null;
  const pick = planChoices(catalog, { scopes: sc, now }).find((x) => x.choice === String(choice || ''));
  if (!pick) return null;
  if (pick.choice === UNSURE) return { scopes: sc, typeless: true };
  return { scopes: sc, subscriptionType: pick.type, ...(pick.tier ? { rateLimitTier: pick.tier } : {}) };
}

/** A choice id is well-formed (the route's first check; offered-ness is choiceShape's) */
function choiceIdOk(choice) {
  const s = String(choice == null ? '' : choice);
  return s === UNSURE || PLAN_ROWS.some((r) => r.id === s) || TYPE_ID.test(s);
}

module.exports = { PLAN_NAMES_AT, FORMER_NAMES_UNTIL, PLAN_ROWS, UNSURE, planChoices, choiceShape, choiceIdOk };
