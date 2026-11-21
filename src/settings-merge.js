'use strict';
/**
 * THE PERSON'S OWN SETTINGS FILE, MERGED UNDER A SUBSCRIPTION PICK — PURE (imports only the PURE src/claude-route-names.js and
 * src/helper-fact.js); CJS. B-e7c0 (2.369.412: this machine's merge) and its paired-machine half (主开发 r723, 2026-11-21): the ONE
 * merge both sides run — the hub's create (through src/billing-pick.js, which re-exports these) and a paired machine's agent (op
 * `settings-merge`, src/machine-probes.js settingsMergeOp — this module is in the device bundle; billing-pick's words are not).
 *   · ownSettingsOf: the person's file text → its settings with every route / credential name of the tree's own list dropped
 *     (and the cloud credential commands), each named;
 *   · mergeLayer: THE ONE MERGE RULE of a person's settings and the hub's layer (both machines' roads — the adapter's own merge);
 *   · deviceMergeOf: + the start's LAYER by that rule (exactly the inline settings the set-aside start carries — no widening),
 *     refused by name for a file that names the helper itself, one that is no JSON object, a layer that is not a bounded object;
 *   · the id a device names its file by (MERGE_SID_RE), the one ask's bound (DEVICE_MERGE_MS), the argv's layer and its path swap.
 */
const ROUTE = require('./claude-route-names.js');
const { namesHelper } = require('./helper-fact.js');

/** B-e7c0 cure: the top-level settings keys that run a cloud credential command (the AWS refresh and export, the Google refresh) */
const MERGE_DROPS_KEYS = Object.freeze(['awsAuthRefresh', 'awsCredentialExport', 'gcpAuthRefresh']);
/** B-e7c0: the person's file text → { settings, dropped } (a plain JSON object), else null — no object is never merged. Under a pick
 *  the pick decides where the turn goes and who bills, so EVERY env name the tree's own rule counts is dropped (src/claude-route-
 *  names.js, the list src/managed-claude-settings.js refuses: the routes and their switches — a switch when present, whatever its
 *  value — the credentials, the proxies and TLS trust, the config folders another login is read from), matched in ANY case, and so
 *  are the cloud credential commands. `dropped` names each (the create says them once, by name, with the door to the pick). */
function ownSettingsOf(text) {
  if (typeof text !== 'string') return null;
  let o = null;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const settings = { ...o }, dropped = [];
  for (const k of MERGE_DROPS_KEYS) if (Object.prototype.hasOwnProperty.call(settings, k)) { delete settings[k]; dropped.push(k); }
  if (settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env)) {
    const env = {};
    for (const [k, v] of Object.entries(settings.env)) { if (ROUTE.routeNameAny(k)) dropped.push(k); else env[k] = v; }
    settings.env = env;
  }
  return { settings, dropped };
}

/** B-e7c0 (paired machine): the layer a hub hands a device's merge — a plain JSON object of at most LAYER_MAX bytes, else refused by name */
const LAYER_MAX = 65536;
/** the id a device names its merged file by: a closed alphabet, bounded (the device checks it itself; nothing else becomes a path part) */
const MERGE_SID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEVICE_MERGE_MS = 4000;   // the ONE ask's bound on a paired start (never retried)
function layerRefusal(layer) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return 'layer-not-object';
  let n = 0;
  try { n = Buffer.byteLength(JSON.stringify(layer), 'utf8'); } catch { return 'layer-not-object'; }
  return n > LAYER_MAX ? 'layer-too-large' : null;
}
/** THE ONE MERGE RULE of a person's settings (`base`) and a layer the hub adds (`layer`), on BOTH machines' roads (主开发 r895, the
 *  must of round wgn4g2rf7: a top-level spread let the layer's `permissions` — the agent's own allow rules, on by default — replace
 *  the person's deny / ask / allow rules): the person's rule lists (permissions.allow / ask / deny), their hooks and their env names
 *  SURVIVE — the layer's entries are ADDED after them, none twice (an env name both carry: the layer's); the person's other
 *  permission keys (their default mode) stand; any OTHER
 *  key of the layer wins (the hub's billing and helper names: apiKeyHelper, the output style, the statusline …). The adapter's
 *  own merge on this machine (src/adapters/claude-code.js mergeSettings) is this function; the device merge below is too. PURE. */
const RULE_LISTS = Object.freeze(['allow', 'ask', 'deny']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const unionOf = (a, b) => { const out = Array.isArray(a) ? a.slice() : []; for (const x of (Array.isArray(b) ? b : [])) if (!out.some((y) => JSON.stringify(y) === JSON.stringify(x))) out.push(x); return out; };
function mergeLayer(base, layer) {
  const out = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(isObj(layer) ? layer : {})) {
    if (k === 'permissions' && isObj(v) && isObj(out.permissions)) {
      const mine = out.permissions, p = { ...v, ...mine };
      for (const r of RULE_LISTS) if (r in mine || r in v) p[r] = unionOf(mine[r], v[r]);
      out.permissions = p;
    } else if (k === 'hooks' && isObj(v) && isObj(out.hooks)) {
      const h = { ...out.hooks };
      for (const [ev, list] of Object.entries(v)) h[ev] = unionOf(h[ev], list);
      out.hooks = h;
    } else if (k === 'env' && isObj(v) && isObj(out.env)) out.env = { ...out.env, ...v };   // the person's own names kept; the hub's win where both name one
    else out[k] = v;
  }
  return out;
}
/** THE MERGE both sides run (PURE): the person's file TEXT + the start's layer → { ok: true, json, dropped } | { ok: false, reason } —
 *  every route / credential name dropped (ownSettingsOf), a file that names the helper itself refused (that file is about billing),
 *  the layer merged by THE ONE RULE (mergeLayer: the person's rule lists and hooks kept, the hub's other keys winning) */
function deviceMergeOf({ ownText = null, layer = null, row = null } = {}) {
  const lr = layerRefusal(layer);
  if (lr) return { ok: false, reason: lr };
  const own = ownSettingsOf(ownText);
  if (!own) return { ok: false, reason: 'own-not-json' };
  if (namesHelper(own.settings, row)) return { ok: false, reason: 'own-names-helper' };
  return { ok: true, json: JSON.stringify(mergeLayer(own.settings, layer)), dropped: own.dropped };   // THE ONE RULE (mergeLayer)
}
/** the argv's ONE `--settings` value: its inline JSON (the layer a device merges) — a plain object, else null (a file path governs) */
function settingsLayerOf(args) {
  const i = Array.isArray(args) ? args.indexOf('--settings') : -1;
  if (i < 0) return null;
  try { const o = JSON.parse(args[i + 1]); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}
/** …and the argv with that value swapped for the device's merged file's PATH (only the path rides the line) */
function withSettingsPath(args, file) {
  const i = Array.isArray(args) ? args.indexOf('--settings') : -1;
  if (i < 0 || typeof file !== 'string' || !file) return args;
  const out = args.slice(); out[i + 1] = file; return out;
}

module.exports = { mergeLayer, RULE_LISTS, ownSettingsOf, MERGE_DROPS_KEYS, LAYER_MAX, MERGE_SID_RE, DEVICE_MERGE_MS, layerRefusal, deviceMergeOf, settingsLayerOf, withSettingsPath };
