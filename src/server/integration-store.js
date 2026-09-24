'use strict';
/**
 * THE INTEGRATION STORE — resolve, mask, broadcast
 * (docs/design-communication-panel.zh.md §14.3, §14.4, §14.6, §14.11).
 *
 * ORCH tier, one `create(deps)` factory. It is THE ONLY reader of the two
 * cluster env forms — `VIBESPACE_INTEGRATIONS` (JSON `[{id,key?,label?,values}]`,
 * the helm Secret) and `VIBESPACE_INTEGRATION_<ID>_<FIELD>` (the single-field
 * form for docker-compose / self-hosting; the JSON form WINS when both name
 * the same row, said once at boot). scripts/test-integration-registry.mjs's
 * env-NAME census fails those names anywhere else in the tree.
 *
 * THE RECORD HOLDS TWO THINGS AND NOTHING ELSE: `values` (what the user typed,
 * secret fields through src/secret-box.js) and `clusterKey` (which cluster
 * preset the user picked). `source` IS DERIVED AT READ TIME AND NEVER STORED:
 * a stored source would fight "a vanished cluster default answers `none`",
 * and a record that only picked a preset is NOT the user's own credentials.
 * A cluster default's VALUES are read from the env at the moment of the
 * question and NEVER copied into data/integrations.json — rotate the env
 * once and every consumer on every instance follows (the mounts rule,
 * src/mounts.js "a mount stores only the preset KEY"). Injecting a default,
 * then withdrawing it, leaves a row that answers `none` WITH THE REASON,
 * never one that quietly keeps serving the old value — by construction.
 *
 * TWO INTENTS, TWO FUNCTIONS (§14.3): `clearUserValues` ("drop my keys") is
 * ALWAYS allowed and lands wherever precedence lands; `useClusterDefault`
 * ("use the cluster's") is a NAMED REFUSAL when there is no cluster default.
 * Folding them would make one of the two outcomes unreachable.
 *
 * `test(id)` CONSTRUCTS NO VENDOR REQUEST. It runs the runner the row's
 * CONSUMER registered (`registerTest(id, fn)`), one in flight per id, bounded
 * by TEST_TIMEOUT_MS, and only ever from a human's click (§14.11.2: the suite
 * censuses that no scheduler/timer/ingest loop calls it). A row whose
 * consumer has not landed (`wiredIn`) answers a NAMED `not-wired` refusal.
 *
 * EVERY WRITE BROADCASTS `integrations-updated` carrying `publicView(id)` —
 * THE one masked view every route returns. Nothing else ever leaves this
 * module with a secret's plaintext except `resolveIntegration()`, which is the
 * consumers' call and is never handed to a route.
 *
 * A VALUE THE USER SET OUTRANKS THE CLUSTER EVEN WHEN IT CANNOT BE OPENED
 * (r3, 2026-09-15, the round-2 verifier): a stored ciphertext the CURRENT
 * key file cannot decrypt (a rotated / restored-from-elsewhere
 * `data/.integrations-key`) used to fall through to the cluster rung —
 * `source:'cluster'`, `why:null`, `hasOwnValues:false`, the Clear button
 * hidden, Test passing on the cluster's credential, zero log lines: the
 * user's own Lark tenant app silently replaced by the cluster's. While a row
 * holds ANY undecryptable field the cluster rung is NEVER consulted: the row
 * answers `none` with the decrypt reason naming the fields, `hasOwnValues`
 * is a fact about the RECORD (it holds values, so "Clear my keys" shows), the
 * view carries a typed `storeError {code:'values-undecryptable'}` with the
 * remedy, and the transition is logged once per row (never once per poll).
 * The env NAME the single-field form is read under is BUILT here and only
 * here (`envFieldName`) — a builder exported from the PURE registry was a
 * second resolver in disguise that the env-name census could not see.
 *
 * A `bindsPerAccount` ROW IS NOT A CARD (2.369.165, docs/design-integrations-
 * per-account.zh.md r4 §2.3/§2.4): its OAuth client is chosen per ACCOUNT
 * where the account is added, exactly like a storage mount's `OAuth client`
 * field. For such a row this store is only the PRESET READER (`presetsFor`:
 * `{key,label}`, the ONE env reader both features share — Google through
 * the injected `drivePresets`, Lark through `VIBESPACE_INTEGRATIONS`) and the
 * `cluster:<k>` rung: `list()` leaves it out, every card verb (`publicView`,
 * `setIntegration`, `setClusterKey`, `useClusterDefault`, `clearUserValues`,
 * `test`) refuses it `404 binds-per-account` BY NAME, the `own` rung answers
 * `own-retired`, `offeredCredentials` lists presets only, and the keyless
 * pick is the cluster's (`prefer` > the only one) — the values and the saved
 * `clusterKey` a pre-r4 card left in integrations.json stay in place with ONE
 * reader: `legacyOwnValues(id)`, the engine's one-shot copy of a legacy `own`
 * account's client onto its own record (the channels engine re-seals it
 * under `.channels-key`). The six browser key rows are untouched.
 */
const fs = require('fs');
const path = require('path');
const R = require('../integration-registry.js');
const { secretBox, SecretBoxError, describeJsonError } = require('../secret-box.js');
const { writeJsonAtomic } = require('../channel-store.js');

const TEST_TIMEOUT_MS = 15000;          // a human-triggered probe, bounded
const FILE = 'integrations.json';
const KEY_FILE = '.integrations-key';
/** An ACCOUNT's credential key: `cluster:<presetKey>` (one env preset by key) or `own` (the user's saved values). */
const OWN_KEY = 'own';
const CLUSTER_PREFIX = 'cluster:';
/** `VIBESPACE_INTEGRATION_<ID>_<FIELD>`: id and field upper-cased, `-`/`:` → `_`.
 *  Lives in THE resolver (r3): the registry DECLARES a row's prefix, this
 *  module is the only thing that turns it into a name it reads. */
const envFieldName = (rowId, fieldKey) => `VIBESPACE_INTEGRATION_${String(rowId).toUpperCase().replace(/[-:]/g, '_')}_${String(fieldKey).toUpperCase().replace(/[-:]/g, '_')}`;

/** A row whose client each ACCOUNT picks (never a card). */
const bindsPer = (row) => !!(row && row.bindsPerAccount === true);

class IntegrationError extends Error {
  constructor(code, message, { status = 400, detail = null } = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.code = code; this.status = status; this.detail = detail;
  }
}

function create(deps = {}) {
  const {
    dataDir,
    env = process.env,
    now = () => Date.now(),
    broadcast = () => {},
    drivePresets = () => [],      // MountManager.drivePresets — the EXISTING reader the gmail row delegates to
    log = console,
  } = deps;
  if (!dataDir) throw new Error('integration-store: dataDir is required');

  const file = path.join(dataDir, FILE);
  const box = secretBox(path.join(dataDir, KEY_FILE));
  const runners = new Map();          // id -> async ({resolved, row, signal}) => {ok, detail?}
  const inflight = new Map();         // id -> Promise
  const listeners = new Set();
  let state = null;
  let keyError = null;                // a TYPED secret-box failure, surfaced never swallowed
  let loadError = null;               // a TYPED "the store file exists but cannot be read" — NEVER cached as an empty state
  let loadErrorSaid = null;           // the last such line logged (publicView is polled; one line per transition)
  const undecryptableSaid = new Map(); // row id -> the last "could not be decrypted" line logged (one per transition, per row)
  let envFormSaid = false;

  // ── persistence ──────────────────────────────────────────────────────────
  // ONLY ENOENT MEANS "FRESH" (2026-09-14, the round-1 verifier's HIGH — the
  // §14.7 bare-catch class one file over from the key file this module was
  // built to fix): the former `try { parse(read) } catch { parsed = null }`
  // read EACCES / EMFILE / EIO / a half-mounted volume as "no store yet",
  // CACHED that empty state, and the next unrelated write replaced the file —
  // every stored credential silently gone. Measured: life 1 stores lark;
  // chmod 000; life 2 reads lark as `none` with no storeError, stores `fake`,
  // and the file holds only `fake`. So: an unreadable file is a TYPED
  // `store-unreadable` every reader surfaces (`storeError`) and every writer
  // REFUSES on, and it is not cached — the next call re-reads. A file that
  // reads but is not a store (not JSON / wrong shape) is ARCHIVED beside
  // itself before anything starts fresh (archive-never-destroy).
  const fresh = () => ({ version: 1, integrations: {} });
  function unreadable(why, e) {
    loadError = new IntegrationError('store-unreadable', `${FILE} ${why} (${(e && e.code) || (e && e.message) || e}) — every write is refused until it can be read`, { status: 500, detail: { code: (e && e.code) || null, file } });
    if (loadErrorSaid !== loadError.message) { loadErrorSaid = loadError.message; log.error('[integrations] ' + loadError.message); }
    return fresh();                   // a throwaway view for THIS read; never assigned to `state`
  }
  function load() {
    if (state) return state;
    let raw;
    try { raw = fs.readFileSync(file, 'utf-8'); }
    catch (e) {
      if (e && e.code === 'ENOENT') { loadError = null; loadErrorSaid = null; state = fresh(); return state; }
      return unreadable('exists but cannot be read', e);
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    const shaped = !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.integrations && typeof parsed.integrations === 'object' && !Array.isArray(parsed.integrations));
    if (!shaped) {
      const corrupt = `${file}.corrupt-${new Date(now()).toISOString().replace(/[:.]/g, '-')}`;
      try { fs.renameSync(file, corrupt); }
      catch (e) { return unreadable('is not a valid store and could not be archived', e); }
      log.error(`[integrations] ${FILE} was not a valid store (${parsed === undefined ? 'not JSON' : 'wrong shape'}) — archived to ${path.basename(corrupt)}, starting fresh`);
    }
    loadError = null; loadErrorSaid = null;
    state = shaped ? parsed : fresh();
    if (!state.version) state.version = 1;
    return state;
  }
  /** Every write asks this first: a write may not start from a state that is not the file's. */
  function assertWritable() { load(); if (loadError) throw loadError; }
  function save() {
    assertWritable();                 // belt — every writer already asked
    fs.mkdirSync(dataDir, { recursive: true });
    writeJsonAtomic(file, state, { mode: 0o600 });   // encrypted secrets inside: owner-only, like the key file
  }
  function rec(id, { create = false } = {}) {
    const s = load();
    if (create) { if (loadError) throw loadError; if (!s.integrations[id]) s.integrations[id] = { values: {}, clusterKey: null, updatedAt: null, testedAt: null, lastOk: null, lastError: null }; }
    return s.integrations[id] || null;
  }
  const storeErrorView = () => (loadError ? { code: loadError.code, message: loadError.message } : keyError ? { code: keyError.code, message: keyError.message } : null);

  // ── secrets ──────────────────────────────────────────────────────────────
  function encField(row, key, plain) {
    const f = row.fields.find((x) => x.key === key);
    if (!f || !f.secret) return String(plain);
    try { keyError = null; return box.enc(plain); }
    catch (e) { keyError = e; throw new IntegrationError('key-unreadable', `cannot encrypt: ${e.message}`, { status: 500 }); }
  }
  /** Plaintext of a stored field, or `undefined` when the key cannot decrypt it. */
  function decField(row, key, stored) {
    const f = row.fields.find((x) => x.key === key);
    if (stored == null || stored === '') return '';
    if (!f || !f.secret) return String(stored);
    try { keyError = null; return box.dec(stored); }
    catch (e) {
      if (e instanceof SecretBoxError && (e.code === 'key-unreadable' || e.code === 'key-malformed')) keyError = e;
      return undefined;
    }
  }
  /** The user's own values, decrypted. `undecryptable` names fields the key could not open.
   *  A `bindsPerAccount` row has NO user values any more (r4): its client
   *  lives on each account; the pre-r4 bytes are read only by
   *  `legacyOwnValues`. */
  function userValues(row) {
    if (bindsPer(row)) return { values: {}, undecryptable: [] };
    const r = rec(row.id);
    const out = {};
    const undecryptable = [];
    for (const [k, v] of Object.entries((r && r.values) || {})) {
      const p = decField(row, k, v);
      if (p === undefined) undecryptable.push(k);
      else if (p !== '') out[k] = p;
    }
    return { values: out, undecryptable };
  }

  // ── the cluster env: THE ONLY READER of both forms ───────────────────────
  let envCache = { raw: undefined, parsed: [] };
  function envJsonEntries() {
    const raw = env.VIBESPACE_INTEGRATIONS;
    if (raw === envCache.raw) return envCache.parsed;
    let parsed = [];
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) throw new Error('not an array');
        for (const e of arr) {
          if (!e || typeof e !== 'object' || !e.id || !e.values || typeof e.values !== 'object') continue;
          parsed.push({ id: String(e.id), key: e.key ? String(e.key) : 'default', label: e.label ? String(e.label) : null, values: Object.fromEntries(Object.entries(e.values).map(([k, v]) => [k, String(v)])) });
        }
      } catch (e) {
        // A mistyped values block must not take the pod down (§14.8) — and
        // the line about it must not carry the block's BYTES: V8's SyntaxError
        // message embeds a source snippet around the error position (a
        // trailing comma printed the last 6 characters of a 40-char secret,
        // where masking permits 4). `describeJsonError` keeps the class and
        // the position only.
        log.error('[integrations] VIBESPACE_INTEGRATIONS unparseable:', describeJsonError(e));
        parsed = [];
      }
    }
    envCache = { raw, parsed };
    return parsed;
  }
  function envPrefixValues(row) {
    if (!row.clusterEnv || !row.clusterEnv.prefix) return null;
    const out = {};
    for (const f of row.fields) {
      const v = env[envFieldName(row.id, f.key)];
      if (v !== undefined && String(v).length) out[f.key] = String(v);
    }
    return Object.keys(out).length ? out : null;
  }
  /** THE PRESET LIST the environment offers this row RIGHT NOW, as
   *  `[{key,label,values}]` — the delegating row's through the injected
   *  `drivePresets`, every other row's from the keyed JSON entries or the
   *  single-field form as ONE preset named 'default'. `clusterDefaultFor`
   *  PICKS from it; the per-account rung (`cluster:<key>`) INDEXES it. */
  function clusterPresetsFor(row) {
    if (row.delegate) {
      return (drivePresets() || []).map((p) => ({ key: String(p.key), label: String(p.label || p.key), values: { clientId: String(p.clientId || ''), clientSecret: String(p.clientSecret || '') } }));
    }
    const json = envJsonEntries().filter((e) => e.id === row.id);
    const fromPrefix = envPrefixValues(row);
    if (json.length && fromPrefix && !envFormSaid) {
      envFormSaid = true;
      log.log(`[integrations] ${row.id}: both VIBESPACE_INTEGRATIONS and VIBESPACE_INTEGRATION_${row.id.toUpperCase()}_* are set — the JSON form is in effect`);
    }
    return json.length
      ? json.map((e) => ({ key: e.key, label: e.label || row.label, values: e.values }))
      : (fromPrefix ? [{ key: 'default', label: row.label, values: fromPrefix }] : []);
  }
  /** What the environment offers this row RIGHT NOW: `{key,label,values}` or null. */
  function clusterDefaultFor(row) {
    const presets = clusterPresetsFor(row);
    if (bindsPer(row)) {
      // THE KEYLESS PICK of an account-bound row (r4): the cluster's own —
      // `prefer` > the only one. A saved `clusterKey` from the retired card
      // is not read (nothing can write it any more; an account names its key).
      const pick = R.pickPreset(presets, { savedKey: null, prefer: (row.delegate && row.delegate.prefer) || null });
      return { def: pick.preset, why: pick.why, whyCode: pick.whyCode || null, whyParams: pick.whyParams || null, options: presets.map((p) => ({ key: p.key, label: p.label })) };
    }
    const r = rec(row.id);
    if (row.delegate) {
      const pick = R.pickPreset(presets, { savedKey: r && r.clusterKey, prefer: row.delegate.prefer });
      return { def: pick.preset, why: pick.why, whyCode: pick.whyCode || null, whyParams: pick.whyParams || null, options: presets.map((p) => ({ key: p.key, label: p.label })) };
    }
    // The env's offers for this row, as PRESETS: every JSON entry (keyed), or
    // the single-field form as one preset named 'default'. The same pick rule
    // as the delegating row — the user's saved choice > the only one — with
    // ONE difference the radio earns (2026-09-14, the round-1 verifier): on a
    // row without a preset PICKER the saved `clusterKey` was never the user's
    // choice of KEY, it was the implicit `'default'` the radio "Use cluster
    // default" stored as a BOOLEAN intent. When the admin later names that
    // same single default (`key: 'tenantA'`) the row answered `none`, the
    // radio greyed, `useClusterDefault` refused and nothing could reach a
    // default that exists. So a vanished saved key RE-BINDS to the env's ONLY
    // preset here (`rebindSingle`, reported in `why`); §14.2's "never a silent
    // swap" stays exactly where it was written — the delegating dropdown,
    // where a key names an OAuth client a refresh token is bound to.
    const options = presets.map((p) => ({ key: p.key, label: p.label }));
    if (!presets.length) {
      const why = r && r.clusterKey
        ? `the cluster default this row used (${r.clusterKey}) is no longer provided by this instance's environment`
        : 'the cluster provides no default for this integration';
      return { def: null, why, whyCode: r && r.clusterKey ? 'preset-gone' : 'no-preset', whyParams: r && r.clusterKey ? { key: r.clusterKey } : null, options };
    }
    const pick = R.pickPreset(presets, { savedKey: r && r.clusterKey, prefer: null, rebindSingle: true });
    return { def: pick.preset, why: pick.why, whyCode: pick.whyCode || null, whyParams: pick.whyParams || null, options, rebound: pick.rebound || null };
  }

  // ── resolution: THE ONE ANSWER every consumer asks ───────────────────────
  /** Why a row's stored values cannot be read: the key FILE's own failure when
   *  there is one, else the ciphertext does not belong to the current key. */
  const undecryptableWhy = (fields) => `stored values could not be decrypted (${fields.join(', ')}): ${keyError ? keyError.message : `the current key file (${KEY_FILE}) is not the one they were written with`}`;
  const UNDECRYPTABLE_REMEDY = `restore the ${KEY_FILE} this instance had when the keys were entered, or clear the keys and enter them again`;
  /** Logged ONCE per row per transition (the view is polled); a row that decrypts again re-arms it. */
  function noteUndecryptable(row, fields) {
    if (!fields.length) { undecryptableSaid.delete(row.id); return; }
    const line = `[integrations] ${row.id}: ${undecryptableWhy(fields)} — the cluster default is NOT consulted while the user's own values cannot be read; ${UNDECRYPTABLE_REMEDY}`;
    if (undecryptableSaid.get(row.id) === line) return;
    undecryptableSaid.set(row.id, line);
    log.error(line);
  }
  /** THE CREDENTIAL KEY an ACCOUNT is bound to (2026-09-22, the owner's
   *  "manage accounts like mounts — each one picks its OAuth client"):
   *  `cluster:<presetKey>` names ONE env preset by key, `own` names the
   *  user's saved values, `null` = the row's own pick (today's precedence).
   *  The keyed rungs NEVER fall through to another client — a refresh token
   *  is bound to the client it was minted under, so a key the env stopped
   *  offering answers `preset-gone` BY NAME rather than another preset
   *  (§14.2 "never a silent swap", now a property of the model itself). */
  const keyOf = (source, clusterKey) => (source === 'cluster' ? CLUSTER_PREFIX + clusterKey : source === 'user' ? OWN_KEY : null);
  function resolveByKey(row, r, key) {
    const base = {
      id: row.id, label: row.label, credentialKey: key,
      savedClusterKey: (r && r.clusterKey) || null,
      testedAt: (r && r.testedAt) || null, lastOk: r ? r.lastOk : null, lastError: (r && r.lastError) || null,
    };
    const none = (why, whyCode, whyParams = null) => ({ ...base, source: 'none', values: {}, whyCode, whyParams, clusterKey: null, clusterLabel: null, fromEnv: false, missing: R.missingFields(row, {}), why });
    if (key === OWN_KEY) {
      // RETIRED for an account-bound row (r4): the account carries its own
      // client (`custom`); a legacy `own` account is copied onto its record by
      // the channels engine through `legacyOwnValues`, never resolved here.
      if (bindsPer(row)) return none(`${row.label}'s client is chosen per account — the saved values are no longer an account's client`, 'own-retired');
      const { values: own, undecryptable } = userValues(row);
      noteUndecryptable(row, undecryptable);
      if (undecryptable.length) return none(undecryptableWhy(undecryptable), 'undecryptable', { fields: undecryptable.slice() });
      if (loadError) return none(loadError.message, 'store-unreadable');
      const res = R.resolvePrecedence(own, null, {});
      if (res.source !== 'user') return none(`no keys of your own are saved for ${row.label}`, 'own-missing');
      return { ...base, source: 'user', values: res.values, whyCode: null, whyParams: null, clusterKey: null, clusterLabel: null, fromEnv: false, missing: R.missingFields(row, res.values), why: null };
    }
    if (key.startsWith(CLUSTER_PREFIX)) {
      const k = key.slice(CLUSTER_PREFIX.length);
      const hit = clusterPresetsFor(row).find((p) => p.key === k);
      if (!hit) return none(`credential ${k} is no longer provided by this instance`, 'preset-gone', { key: k });
      return { ...base, source: 'cluster', values: { ...hit.values }, whyCode: null, whyParams: null, clusterKey: k, clusterLabel: hit.label || null, fromEnv: true, missing: R.missingFields(row, hit.values), why: null };
    }
    return none(`unknown credential key '${key}' for ${row.label}`, 'unknown-credential', { key });
  }
  /** Every credential this row can bind a NEW account to right now:
   *  `[{key:'cluster:<k>', label, source:'cluster', presetKey}, …,
   *  {key:'own', label:null, source:'user'}]` — `own` only while the user's
   *  saved values are complete and readable (the client words it; a label
   *  here would be an English sentence on the wire). Key + label only. */
  function offeredCredentials(id) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    const out = clusterPresetsFor(row).map((p) => ({ key: CLUSTER_PREFIX + p.key, label: p.label || null, source: 'cluster', presetKey: p.key }));
    if (bindsPer(row)) return out;       // r4: presets only — `custom` lives on the account, `own` is retired
    const { values: own, undecryptable } = userValues(row);
    // `own` is ALWAYS offered (2.369.147 r3, owner: "为啥没有自定义选项"): available when the user's
    // values are complete, else listed with what is missing — the wizard draws it and sends
    // the user to the Integrations card; the engine refuses an unavailable key by name.
    const missing = (undecryptable.length || loadError) ? row.fields.filter((f) => f.required).map((f) => f.key) : R.missingFields(row, own);
    out.push({ key: OWN_KEY, label: null, source: 'user', presetKey: null, available: !missing.length, missing });
    return out;
  }
  /** THE PRESETS an account-bound row offers the account dialog RIGHT NOW —
   *  `[{key, label}]`, the wire shape (never a value). The same ONE reader
   *  the storage dialog's `drivePresets()` is for Google. */
  function presetsFor(id) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    return clusterPresetsFor(row).map((p) => ({ key: String(p.key), label: String(p.label || p.key) }));
  }
  /** THE ONE READER of a pre-r4 card's own values (r4 §2.6): the engine's
   *  one-shot copy of a legacy `own` account's client onto the account
   *  record. `{ok:true, values}` (plaintext — handed to the engine only,
   *  never a route, never a log) or `{ok:false, code, why, missing?}` BY NAME:
   *  `integration-key-missing` (the key file is gone — never minted here:
   *  a fresh key cannot open old ciphertext and would only hide that),
   *  `values-undecryptable`, `own-missing`, `store-unreadable`. */
  function legacyOwnValues(id) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    const r = rec(row.id);
    if (loadError) return { ok: false, code: 'store-unreadable', why: loadError.message };
    const stored = (r && r.values) || {};
    if (!Object.keys(stored).length) return { ok: false, code: 'own-missing', why: `no keys of your own were saved for ${row.label}`, missing: row.fields.filter((f) => f.required).map((f) => f.key) };
    if (row.fields.some((f) => f.secret && stored[f.key]) && !box.hasKey()) return { ok: false, code: 'integration-key-missing', why: `${KEY_FILE} is missing — the saved ${row.label} secret cannot be decrypted (restore the key file this instance had when it was entered)` };
    const values = {}; const undecryptable = [];
    for (const [k, v] of Object.entries(stored)) {
      const p = decField(row, k, v);
      if (p === undefined) undecryptable.push(k); else if (p !== '') values[k] = p;
    }
    if (undecryptable.length) return { ok: false, code: 'values-undecryptable', why: undecryptableWhy(undecryptable), fields: undecryptable };
    const missing = R.missingFields(row, values);
    if (missing.length) return { ok: false, code: 'own-missing', why: `the saved ${row.label} values lack ${missing.join(', ')}`, missing };
    return { ok: true, values };
  }
  /** Every card verb asks this first: an account-bound row is not a card. */
  function assertCard(row) {
    if (bindsPer(row)) throw new IntegrationError('binds-per-account', `${row.label}'s OAuth client is chosen per account where the account is added (Communication panel → Connect an account) — it is not an Integrations card`, { status: 404, detail: { id: row.id } });
  }

  function resolveIntegration(id, { credentialKey = null } = {}) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    const r = rec(row.id);
    const key = credentialKey == null || credentialKey === '' ? null : String(credentialKey);
    if (key) return resolveByKey(row, r, key);
    const { values: own, undecryptable } = userValues(row);
    const cluster = clusterDefaultFor(row);
    noteUndecryptable(row, undecryptable);
    // A VALUE THE USER SET OUTRANKS THE CLUSTER EVEN WHEN IT CANNOT BE OPENED
    // (r3): while any stored field is undecryptable the cluster rung is never
    // consulted — feeding the decrypted remainder (`{}`) to the precedence
    // rule handed the row to the cluster with no signal anywhere.
    const res = undecryptable.length
      ? { source: 'none', values: {}, clusterKey: null, label: null, why: undecryptableWhy(undecryptable), whyCode: 'undecryptable', whyParams: { fields: undecryptable.slice() } }
      : R.resolvePrecedence(own, cluster.def, { clusterWhy: cluster.why, clusterWhyCode: cluster.whyCode, clusterWhyParams: cluster.whyParams });
    let why = res.why, whyCode = res.whyCode || null, whyParams = res.whyParams || null;
    // An unreadable store means the user's OWN values are UNKNOWN, not absent:
    // the cluster may still serve the row, but `none` must say the real reason.
    if (res.source === 'none' && loadError) { why = loadError.message; whyCode = 'store-unreadable'; whyParams = null; }
    // A re-bound single default names the re-bind (it is the only time a
    // `cluster` answer carries a `why`) so the card and the journal can say it.
    if (res.source === 'cluster' && cluster.rebound) { why = `the cluster default this row used (${cluster.rebound.from}) was re-keyed to ${cluster.rebound.to} — the only default this instance offers`; whyCode = 'rebound'; whyParams = { from: cluster.rebound.from, to: cluster.rebound.to }; }
    const missing = R.missingFields(row, res.values);
    return {
      id: row.id, label: row.label,
      source: res.source, values: res.values,
      credentialKey: keyOf(res.source, res.clusterKey),                   // the key a NEW account would be stamped with (the row's own pick)
      // `why` is the English contract sentence; `whyCode` + `whyParams` are the
      // same fact as STRUCTURE (the client words it, a3 i18n)
      whyCode, whyParams,
      clusterKey: res.source === 'cluster' ? res.clusterKey : null,      // the preset IN EFFECT
      savedClusterKey: (r && r.clusterKey) || null,                       // the selector the user saved
      clusterLabel: res.source === 'cluster' ? res.label : null,
      fromEnv: res.source === 'cluster', missing, why,
      testedAt: (r && r.testedAt) || null, lastOk: r ? r.lastOk : null, lastError: (r && r.lastError) || null,
    };
  }

  // ── the ONE masked view ──────────────────────────────────────────────────
  function publicView(id) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    assertCard(row);
    const r = rec(row.id);
    const res = resolveIntegration(id);
    const { undecryptable } = userValues(row);
    const set = {}, masked = {}, values = {};
    for (const f of row.fields) {
      const v = res.values[f.key];
      set[f.key] = !!(v && String(v).length);
      if (f.secret) masked[f.key] = set[f.key] ? R.maskValue(v) : null;
      else values[f.key] = set[f.key] ? String(v) : '';
    }
    const cluster = clusterDefaultFor(row);
    return {
      id: row.id, label: row.label,
      fields: R.fieldDecls(row),
      setup: row.setup ? { callbackUrl: row.setup.callbackUrl || null, callbackNote: row.setup.callbackNote || null, prerequisites: (row.setup.prerequisites || []).slice() } : null,
      source: res.source, why: res.why, whyCode: res.whyCode || null, whyParams: res.whyParams || null, clusterKey: res.clusterKey, savedClusterKey: res.savedClusterKey, clusterLabel: res.clusterLabel,
      clusterAvailable: !!cluster.def, clusterWhy: cluster.def ? null : cluster.why, clusterWhyCode: cluster.def ? null : (cluster.whyCode || null), clusterWhyParams: cluster.def ? null : (cluster.whyParams || null),
      clusterOptions: cluster.options,           // key + label ONLY
      delegate: row.delegate ? { multi: !!row.delegate.multi, prefer: row.delegate.prefer || null } : null,
      fromEnv: res.fromEnv, set, masked, values, missing: res.missing,
      // A fact about the RECORD, not about decryptability: a row holding
      // ciphertext the key cannot open still holds values ("Clear my keys" must
      // be reachable — it is the only way to discard an orphaned ciphertext).
      hasOwnValues: Object.keys((r && r.values) || {}).length > 0,
      testedAt: res.testedAt, lastOk: res.lastOk, lastError: res.lastError,
      testKind: row.test.kind, testDescribe: row.test.describe || null, testCaveat: row.test.caveat || null,
      testButton: R.TEST_BUTTON_LABEL[row.test.kind],
      consumers: row.consumers.slice(), usedBy: row.usedBy || null, wiredIn: row.wiredIn || null, docs: row.docs || null,
      // the store-level failures outrank; else THIS row's own typed one (the card says the remedy)
      storeError: storeErrorView() || (undecryptable.length ? { code: 'values-undecryptable', message: UNDECRYPTABLE_REMEDY, fields: undecryptable.slice() } : null),
    };
  }
  function list() {
    return { integrations: R.ROWS.filter((r) => !bindsPer(r)).map((r) => publicView(r.id)), storeError: storeErrorView() };
  }

  // ── change notification (the cache-invalidation law: ONE entry point) ────
  function changed(id, why) {
    const view = publicView(id);
    try { broadcast({ type: 'integrations-updated', id, why, integration: view }); } catch (e) { log.warn('[integrations] broadcast failed:', e && e.message); }
    for (const fn of listeners) { try { fn(id, why); } catch (e) { log.warn('[integrations] listener failed:', e && e.message); } }
    return view;
  }
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // ── writes ───────────────────────────────────────────────────────────────
  /** Omitted = untouched · '' = cleared · else trimmed + validated FIRST. */
  function setIntegration(id, patch) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    assertCard(row);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new IntegrationError('bad-request', 'values must be an object');
    assertWritable();
    const v = R.validateValues(row, patch);
    if (!v.ok) {
      const named = Object.entries(v.errors).map(([k, why]) => `${k}: ${why}`).join('; ');
      throw new IntegrationError('invalid-values', `invalid value — ${named}`, { detail: v.errors });
    }
    const r = rec(row.id, { create: true });
    let touched = 0;
    for (const [k, val] of Object.entries(v.values)) {
      if (val === '') { if (r.values[k] !== undefined) { delete r.values[k]; touched++; } continue; }
      r.values[k] = encField(row, k, val);
      touched++;
    }
    if (!touched) return publicView(id);
    r.updatedAt = now();
    save();
    return changed(id, 'set');
  }

  /** The delegating row's dropdown / a multi-default row's picker: store the
   *  SELECTOR only, and drop the user's own values — a preset and "my own" are
   *  the same choice made two ways. */
  function setClusterKey(id, key) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    assertCard(row);
    assertWritable();
    const cluster = clusterDefaultFor(row);
    const k = key == null ? null : String(key);
    if (k && !cluster.options.some((o) => o.key === k)) {
      throw new IntegrationError('no-such-preset', `the cluster provides no preset named '${k}' (available: ${cluster.options.map((o) => o.key).join(', ') || 'none'})`);
    }
    const r = rec(row.id, { create: true });
    r.clusterKey = k;
    // Picking a PRESET drops the user's own values (one pair, chosen two ways
    // is still one pair); picking "my own" (null) keeps them.
    if (k) r.values = {};
    r.updatedAt = now();
    save();
    return changed(id, 'cluster-key');
  }

  /** "Use the cluster default" — a NAMED refusal when there is none. */
  function useClusterDefault(id) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    assertCard(row);
    assertWritable();
    const r = rec(row.id, { create: true });
    // "Would the cluster serve this row?" — asked of the env, never of the record's values.
    const cluster = clusterDefaultFor(row);
    if (!cluster.def) throw new IntegrationError('no-cluster-default', `cannot use the cluster default for ${row.label}: ${cluster.why}`, { status: 409, detail: { why: cluster.why } });
    r.values = {};
    r.clusterKey = cluster.def.key;
    r.updatedAt = now();
    save();
    return changed(id, 'use-cluster');
  }

  /** "Drop my keys" — ALWAYS allowed; lands on cluster or none. */
  function clearUserValues(id) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    assertCard(row);
    assertWritable();                 // "nothing to clear" is a claim about the FILE, unanswerable while it cannot be read
    const r = rec(row.id);
    if (!r || !Object.keys(r.values || {}).length) return publicView(id);
    r.values = {};
    r.updatedAt = now();
    save();
    return changed(id, 'clear');
  }

  // ── test: human-triggered, bounded, one in flight per id ─────────────────
  function registerTest(id, fn) {
    if (!R.rowById(id)) throw new Error(`registerTest: unknown integration '${id}'`);
    if (typeof fn !== 'function') throw new Error(`registerTest(${id}): a runner function is required`);
    runners.set(id, fn);
  }
  async function test(id, { credentialKey = null } = {}) {
    const row = R.rowById(id);
    if (!row) throw new IntegrationError('unknown-integration', `unknown integration '${id}'`, { status: 404 });
    assertCard(row);                  // D7: no Test verb on an account-bound row
    const runner = runners.get(id);
    if (!runner) {
      if (row.wiredIn) throw new IntegrationError('not-wired', `${row.label}'s consumer is not wired until ${row.wiredIn} — nothing here can test it yet`, { status: 501, detail: { wiredIn: row.wiredIn } });
      throw new IntegrationError('no-test-runner', `${row.label} declares a test but no consumer registered a runner`, { status: 501 });
    }
    assertWritable();                 // the verdict is RECORDED; a probe whose record cannot land is refused before it runs
    if (inflight.has(id)) return inflight.get(id);
    const p = (async () => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TEST_TIMEOUT_MS);
      let verdict;
      try {
        const resolved = resolveIntegration(id, { credentialKey });   // a per-ACCOUNT probe resolves THAT account's key; the card's button the row's pick
        const out = await Promise.race([
          runner({ resolved, row, signal: ac.signal }),
          new Promise((_, rej) => ac.signal.addEventListener('abort', () => rej(new Error(`test timed out after ${TEST_TIMEOUT_MS / 1000}s`)))),
        ]);
        verdict = out && out.ok === true ? { ok: true, error: null, detail: out.detail || null } : { ok: false, error: (out && (out.error || out.why)) || 'test failed', detail: (out && out.detail) || null };
      } catch (e) {
        verdict = { ok: false, error: String((e && e.message) || e), detail: null };
      } finally { clearTimeout(timer); }
      const r = rec(row.id, { create: true });
      r.testedAt = now(); r.lastOk = verdict.ok; r.lastError = verdict.ok ? null : verdict.error;
      save();
      changed(id, 'test');
      return { ...verdict, testedAt: r.testedAt, caveat: row.test.caveat || null, kind: row.test.kind };
    })();
    inflight.set(id, p);
    try { return await p; } finally { inflight.delete(id); }
  }

  return {
    resolveIntegration, offeredCredentials, presetsFor, legacyOwnValues, publicView, list,
    setIntegration, setClusterKey, useClusterDefault, clearUserValues,
    test, registerTest, hasTestRunner: (id) => runners.has(id),
    onChange, file, keyFile: box.keyFile,
    IntegrationError, TEST_TIMEOUT_MS,
  };
}

module.exports = { create, IntegrationError, TEST_TIMEOUT_MS, FILE, KEY_FILE, OWN_KEY, CLUSTER_PREFIX, envFieldName };
