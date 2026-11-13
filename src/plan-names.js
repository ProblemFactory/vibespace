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
const TIER_ID = /^tier:(default_claude_[a-z0-9_]{1,40})$/;
// NEVER OFFERED (acceptance r1): a free plan is no subscription a long-lived token serves — whatever the CLI's map carries
const NEVER_TYPES = Object.freeze(['free']);

const strings = (xs) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string' && x) : []);

/** The way-② choices for this CLI, in the order the person reads them → [{choice, type, tier, name, formerly, own}] — the table's
 *  rows the CLI carries, then the CLI's OTHER types by their own ids, then its OTHER tiers by their own ids (acceptance r1: a tier
 *  the table has no row for is shown and pickable — never dropped, never paired with a type by a guess: it writes the tier
 *  alone), then «先不选» LAST. `own: true` = a value shown by the CLI's own id (the page says so beside it). Free is never
 *  offered. [] (way ② not offered — «登录一次» alone) when the CLI's mint scopes were not measured or its bytes carry no type.
 *  `catalog` = claude-plan-catalog's result. */
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
  for (const t of types) if (!named.has(t) && !NEVER_TYPES.includes(t)) out.push({ choice: 'type:' + t, type: t, tier: null, name: t, formerly: null, own: true });
  const pairedTiers = new Set(PLAN_ROWS.map((r) => r.tier).filter(Boolean));
  for (const tr of tiers) if (!pairedTiers.has(tr) && /^default_claude_[a-z0-9_]{1,40}$/.test(tr) && !/(?:^|_)free(?:_|$)/.test(tr)) out.push({ choice: 'tier:' + tr, type: null, tier: tr, name: tr, formerly: null, own: true });
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
  if (!pick.type) return { scopes: sc, typeless: true, rateLimitTier: pick.tier };   // a tier by its own id: the tier alone
  return { scopes: sc, subscriptionType: pick.type, ...(pick.tier ? { rateLimitTier: pick.tier } : {}) };
}

/** THE ROW'S WORDS FOR A SHAPE (acceptance r1: «Ultra reads max — now the name of the OTHER plan»): the table's CURRENT name of
 *  a stored shape → {name, formerly} (formerly until FORMER_NAMES_UNTIL), or {name: <the CLI's own id>, own: true} for a value no
 *  row names, or null (typeless, no tier). Never a guess: a type the table pairs with tiers (max) and no tier reads by its id. */
function shapeName(shape, { now = Date.now() } = {}) {
  if (!shape || typeof shape !== 'object') return null;
  const type = typeof shape.subscriptionType === 'string' && shape.subscriptionType ? shape.subscriptionType : (typeof shape.type === 'string' && shape.type ? shape.type : null);
  const tier = typeof shape.rateLimitTier === 'string' && shape.rateLimitTier ? shape.rateLimitTier : (typeof shape.tier === 'string' && shape.tier ? shape.tier : null);
  const r = type && PLAN_ROWS.find((x) => x.type === type && (x.tier || null) === tier);
  if (r) return { name: r.name, formerly: Number(now) < FORMER_NAMES_UNTIL ? r.formerly : null };
  if (type) return { name: type, formerly: null, own: true };
  if (tier) return { name: tier, formerly: null, own: true };
  return null;
}

/** A choice id is well-formed (the route's first check; offered-ness is choiceShape's) */
function choiceIdOk(choice) {
  const s = String(choice == null ? '' : choice);
  return s === UNSURE || PLAN_ROWS.some((r) => r.id === s) || TYPE_ID.test(s) || TIER_ID.test(s);
}

module.exports = { PLAN_NAMES_AT, FORMER_NAMES_UNTIL, PLAN_ROWS, UNSURE, NEVER_TYPES, planChoices, choiceShape, choiceIdOk, shapeName };
