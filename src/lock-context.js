'use strict';
/**
 * THE CONTEXT A LOCK KEEPS — PURE, imports only the model-id core (src/model-core.js); CJS so the hub, the page and the suites
 * share ONE spelling (B-6c55).
 *
 * A Lock records the model the chip showed — the CLI's RESOLVED id (`claude-fable-5`), never its 1M-context form: the
 * CLI reports a model without its `[1m]` suffix (zero of 2650 transcripts' `message.model` carry one), and the Lock
 * is master's (主开发 2026-11-11 18:28Z: the hub locks what the chip showed). So a Lock made on a `fable[1m]`
 * conversation, then a resume (its saved config's model = the target) or a turn-end repin (`/model <target>`),
 * commanded the SHORT context — the person's 1M ask was dropped without a word.
 *
 * THE RULING (主开发 2026-11-18 00:07Z): the Lock's target stays what the chip shows; the person's context ask lives
 * BESIDE it as its own saved fact (`lockContext`), and the two roads that COMMAND the CLI with the lock — the turn-end
 * repin and a resume's --model — send both. Laws:
 *   (a) the fact is the PERSON's ask only — the model the hub commanded for them (their pick, else the spawn's model),
 *       never one the CLI reported; it is cleared when the lock lifts or the person picks a model without it;
 *   (b) the chip, the pool's request model and the projection keep reading the TARGET, byte for byte as on the release;
 *   (c) a resume with the fact on a model the CLI says has no long context says so by name, never a silent short one.
 *
 * contextOf(model)          → '1m' when the model names the 1M context (`…[1m]`), else null
 * withContext(model, ctx)   → the model to COMMAND: the target with `[1m]` when the fact says so (never doubled), else
 *                             the target unchanged
 * lockContextFor(ask)       → the fact a Lock (or a re-target) records from the person's ask
 * longContextOf(catalog, m) → the installed CLI's own word on the model's 1M form (true / false / null = not known)
 */
const { core } = require('./model-core.js');   // the catalog's own name rule (batch 21's cure)
const LONG = '1m';
const SUFFIX_RE = /\[1m\]$/i;

const contextOf = (model) => (typeof model === 'string' && SUFFIX_RE.test(model.trim()) ? LONG : null);
function withContext(model, ctx) {
  const m = typeof model === 'string' ? model.trim() : '';
  if (!m || ctx !== LONG || SUFFIX_RE.test(m)) return model || null;
  return m + '[1m]';
}
const lockContextFor = (ask) => contextOf(ask);
/** THE FACT A LOCK RECORDS (law a): the person's context ask — their pick when they made one, else what their spawn commanded
 *  (`spawn` / `spawnContext`: the spawn's model, and the context its --model carried) — and ONLY when that ask names the model the
 *  lock holds (`same`: model-ask sameModel). A pick the chip no longer shows (a typed /model moved the CLI), an instance default, a
 *  model the CLI reported: no fact. */
function contextAskFor({ picked = null, spawn = null, spawnContext = null } = {}, target, same) {
  const ask = picked || spawn;
  if (!ask || !target || typeof same !== 'function' || !same(ask, target)) return null;
  return picked ? contextOf(picked) : (contextOf(spawn) || lockContextOf(spawnContext));
}
/** the saved value, read back: only the one known fact counts (anything else is no fact) */
const lockContextOf = (v) => (v === LONG ? LONG : null);

/** law (c): does the INSTALLED CLI's own catalog (src/server/cli-model-catalog.js view — read from its binary) give this
 *  model a 1M form? true / false (the catalog names the model and gives it none) / null (no catalog read, or the model is
 *  not in it — an alias, another harness: nothing is judged, the person's ask is commanded as asked) */
function longContextOf(catalog, model) {
  const name = typeof model === 'string' ? model.trim().replace(SUFFIX_RE, '') : '';
  const rows = catalog && Array.isArray(catalog.models) ? catalog.models : null;
  if (!name || !rows) return null;
  const al = catalog.aliases && typeof catalog.aliases === 'object' ? catalog.aliases : {};
  // (an alias in ANY case — the verdict's own choice, not the catalog's: the catalog reader keys aliases as written; refusing the 1M form
  // of a spelling the CLI itself might reject costs nothing)
  const alias = Object.keys(al).find((k) => typeof al[k] === 'string' && k.toLowerCase() === name.toLowerCase());   // an alias → its model
  // MATCHED AS THE CATALOG MATCHES (its core: lowercased, no `claude-`): the catalog id, or the dated first-party id the CLI reports
  const key = core(alias ? al[alias] : name);
  const row = key ? rows.find((m) => m && ((m.id && core(m.id) === key) || (m.firstParty && core(m.firstParty) === key))) : null;
  if (!row) return null;
  return row.oneM === 'native' || row.oneM === 'beta';
}
/** the person's words when the CLI gives the locked model no long context (an English t() key; {model} = the target) */
const NO_LONG_CONTEXT = '{name} is locked to {model} with the 1M context, but this Claude Code gives {model} no 1M context — it resumed with the standard context';
/** the model to command with the fact, the installed CLI's catalog asked (null = not judged: no catalog, a remote machine's CLI)
 *  → { model, refused } — refused: the catalog gives the target no 1M form, so the target goes WITHOUT [1m] (never asked of it) */
function commandOf(target, ctx, catalog) {
  if (ctx !== LONG || !target) return { model: target || null, refused: false };
  if (catalog && longContextOf(catalog, target) === false) return { model: String(target).trim().replace(SUFFIX_RE, ''), refused: true };
  return { model: withContext(target, ctx), refused: false };
}

module.exports = { LONG, contextOf, withContext, lockContextFor, lockContextOf, contextAskFor, longContextOf, commandOf, NO_LONG_CONTEXT };
