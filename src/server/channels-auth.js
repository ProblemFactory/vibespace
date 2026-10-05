'use strict';
/**
 * THE AUTH FAMILY of the Channels engine (lane dc-channels-seams, 2026-10-05 — rv-channels-core C11): moved
 * VERBATIM out of channels-engine.js's one `create()` closure. An account's credential: the client resolution
 * (clientFor / resolverFor / credentialFacts / the offered keys), the pending consent flows (startOAuth / landing /
 * callback / connect / reauthorize / finish / cancel), THE IDENTITY DOOR (a consent must name its account; a
 * rebind is judged against the holder — applyRebind / connectFromFlow / stampIdentities), the legacy-client
 * migration and the account verbs (disconnect / remove / duplicate / label / secret / enabled / policy / options).
 * The engine stays vendor-free: a vendor's consent facts arrive through its declared rows, never an id here.
 */

const crypto = require('crypto');
const { ChannelError } = require('../channels/index.js');
const { cancelledSentence, identityOf, namelessSentence, heldIdentity, identityMismatch, mismatchSentence } = require('../channel-identity.js');
const caps = require('../channel-caps.js');
const { OWN_KEY, CLUSTER_PREFIX } = require('./integration-store.js');
const R = require('../integration-registry.js');
const F = require('../channel-filter.js');
const P = require('../channel-policy.js');
const ACL = require('../channel-acl.js');
const OF = require('../channel-outbox-files.js');

/** THE FAMILY'S FACTORY — `engineCtx` is the engine's ONE context object (channels-engine.js, the composition root): every
 *  field this family reads is named in the destructure below (test-architecture §79 pins the list), and what it answers
 *  is merged back into the same object for the engine and the families created after it. */
function create(engineCtx) {
  const {
    KEY_FILE, CUSTOM_KEY, PENDING_FLOW_TTL_MS, DUPLICATE_FIELDS, registry, integrations, mountClients, now, log, fetchFn, deliver, liveSessions,
    store, box, flows, signState, consentRowOf, consentDepsOf, resolveIntegration, rowOf, live, paceCarry, adapterRecords, saveAdapters,
    refusedScopesOf, tokensFor, adapterFor, refreshAuth, EMPTY_SCAN, pass, rejudgeConvCaps, conversationName, presetsOf, clientFieldDecls,
    customClientView, vendorNameOf, adapterView, notify, disarmPush, syncPushLanes, dropLive, retractUnsaved, retractFailure, wakeTimers, policyFor,
    accountGrainOf, patternsOf, convGrainOf, honestyLineFor, notifyOutbox,
  } = engineCtx;
  /** THIS ACCOUNT'S CLIENT, as the resolver shape every adapter already
   *  reads (`{source, values, missing, why, whyCode, credentialKey, …}`):
   *  `custom` ⇒ the record's own `credential` (decrypted here, handed to the
   *  adapter only); `own` ⇒ the legacy card's values until the reader-side
   *  copy lands (then the record's own); `cluster:<k>` / null ⇒ the store,
   *  unchanged. A preset the env stopped offering answers `preset-gone`
   *  naming its key — never another client (the store's rule). */
  function clientFor(rec) {
    const mod = registry.vendor(rec && rec.kind) || null;
    const row = rowOf(mod) || (rec && R.rowById(rec.kind)) || null;
    const key = (rec && typeof rec.credentialKey === 'string' && rec.credentialKey) || null;
    if (row && row.signin === 'paste' && !isClientKey(key)) return pasteClientOf(row);   // design 018: a key-less Slack account is the paste rung
    if (row && row.bindsPerAccount && key === CUSTOM_KEY) return customClientOf(rec, row, CUSTOM_KEY);
    if (row && row.bindsPerAccount && key === OWN_KEY) return legacyClientOf(rec, row);
    if (!resolveIntegration) return { id: row ? row.id : null, source: 'none', values: {}, missing: [], why: 'no integration store', whyCode: 'no-store', whyParams: null, credentialKey: key, clusterKey: null, clusterLabel: null };
    return resolveIntegration(row ? row.id : (mod && mod.integration), { credentialKey: key });
  }
  /** design 018: a key that names a CLIENT (a preset or the account's own) — anything else on a paste row is the paste. */
  const isClientKey = (k) => k === CUSTOM_KEY || (typeof k === 'string' && k.startsWith(CLUSTER_PREFIX));
  /** design 012 (Slack S1): a `signin:'paste'` row has NO client — each person's own app, a pasted token. Nothing to
   *  resolve, nothing missing: the answer every credential question reads as "ready". */
  function pasteClientOf(row) {
    return { id: row.id, label: row.label, credentialKey: null, source: 'paste', values: {}, missing: [], why: null, whyCode: null, whyParams: null, clusterKey: null, clusterLabel: null, savedClusterKey: null, fromEnv: false, testedAt: null, lastOk: null, lastError: null };
  }
  function customClientOf(rec, row, asKey) {
    const cf = R.clientFieldsOf(row);
    const c = rec && rec.credential && typeof rec.credential === 'object' ? rec.credential : null;
    const base = { id: row.id, label: row.label, credentialKey: asKey, clusterKey: null, clusterLabel: null, savedClusterKey: null, fromEnv: false, testedAt: null, lastOk: null, lastError: null };
    const none = (why, whyCode, whyParams = null, missing = R.missingFields(row, {})) => ({ ...base, source: 'none', values: {}, missing, why, whyCode, whyParams });
    if (!c || !c.appSecretEnc) return none(`${(rec && (rec.label || rec.id)) || row.label} has no client of its own saved`, 'custom-missing', { fields: [cf.secretKey] });
    let secret;
    try { secret = box.dec(c.appSecretEnc); }
    catch (e) { return none(`${(rec && (rec.label || rec.id)) || row.label}'s own client secret cannot be decrypted with ${KEY_FILE} (${(e && e.code) || 'bad-ciphertext'})`, 'custom-undecryptable'); }
    const values = {};
    if (c.appId) values[cf.idKey] = String(c.appId);
    values[cf.secretKey] = secret;
    const missing = R.missingFields(row, values);
    if (missing.length) return none(`${(rec && (rec.label || rec.id)) || row.label}'s own client lacks ${missing.join(', ')}`, 'custom-missing', { fields: missing }, missing);
    return { ...base, source: 'custom', values, missing: [], why: null, whyCode: null, whyParams: null };
  }
  /** A legacy `own` account (r4 §2.6): served from the record once the copy
   *  wrote it, else from the retired card's values through the store's ONE
   *  legacy reader — and the copy is scheduled (reader-side, idempotent). */
  function legacyClientOf(rec, row) {
    if (rec.credential && rec.credential.appSecretEnc) { scheduleInline(rec); return customClientOf(rec, row, OWN_KEY); }
    scheduleInline(rec);
    const lv = integrations && typeof integrations.legacyOwnValues === 'function' ? integrations.legacyOwnValues(row.id) : { ok: false, code: 'no-store', why: 'no integration store to read the legacy values from' };
    if (!lv.ok) return { id: row.id, label: row.label, credentialKey: OWN_KEY, source: 'none', values: {}, missing: lv.missing || R.missingFields(row, {}), why: `the saved ${row.label} client could not be moved onto ${rec.label || rec.id}: ${lv.why}`, whyCode: 'legacy-copy-failed', whyParams: { why: lv.code }, clusterKey: null, clusterLabel: null };
    return { id: row.id, label: row.label, credentialKey: OWN_KEY, source: 'user', values: { ...lv.values }, missing: [], why: null, whyCode: null, whyParams: null, clusterKey: null, clusterLabel: null };
  }
  /** The resolver handed to ONE record's adapter: its own client for its
   *  own row, the store for anything else. `undefined` without a store on a
   *  record that names no client of its own (the contract suites' bare
   *  engines keep their "no resolver" answers). */
  function resolverFor(rec) {
    const key = rec && rec.credentialKey;
    if (!resolveIntegration && key !== CUSTOM_KEY && key !== OWN_KEY) return undefined;
    return (id, opts = {}) => {
      const row = R.rowById(id);
      const k = opts && typeof opts.credentialKey === 'string' ? opts.credentialKey : null;
      // the LIVE record, never a copy: the reader-side legacy copy is scheduled on it
      if (row && row.bindsPerAccount && k === CUSTOM_KEY) return customClientOf(rec, row, CUSTOM_KEY);
      if (row && row.bindsPerAccount && k === OWN_KEY) return legacyClientOf(rec, row);
      if (!resolveIntegration) return { id, source: 'none', values: {}, missing: [], why: 'no integration store', whyCode: 'no-store', whyParams: null, credentialKey: k };
      return resolveIntegration(id, opts);
    };
  }
  const factsOf = (r, fallbackKey = null) => ({ source: r.source, why: r.why || null, whyCode: r.whyCode || null, whyParams: r.whyParams || null, missing: Array.isArray(r.missing) ? r.missing.slice() : [], clusterLabel: r.clusterLabel || null, credentialKey: r.credentialKey || fallbackKey || null });
  /** The credential FACTS of ONE account (never the values). */
  function credentialFactsFor(rec) {
    try { return factsOf(clientFor(rec), rec.credentialKey || null); }
    catch (e) { return { source: 'unknown', why: `integration lookup failed: ${(e && e.message) || e}`, whyCode: 'lookup-failed', whyParams: null, missing: [], clusterLabel: null, credentialKey: rec.credentialKey || null }; }
  }
  /** The credential FACTS the panel's connect wizard needs (§10.1's three
   *  copy paths: none / cluster / user) — never the values. */
  function credentialFacts(integrationId, credentialKey = null) {
    // `why` is the store's English contract sentence; `whyCode` + `whyParams`
    // are the same fact as STRUCTURE — the client words them (a3 i18n).
    // `credentialKey` (2026-09-22) = an ACCOUNT's own binding (`cluster:<k>` /
    // `own`); null asks the row's pick — what a NEW account would be bound to.
    const prow = integrationId ? R.rowById(integrationId) : null;
    if (prow && prow.signin === 'paste' && !isClientKey(credentialKey)) return { source: 'paste', why: null, whyCode: null, whyParams: null, missing: [], clusterLabel: null, credentialKey: null };
    if (!integrationId || !resolveIntegration) return { source: 'unknown', why: 'no integration store', whyCode: 'no-store', whyParams: null, missing: [], clusterLabel: null, credentialKey: credentialKey || null };
    try {
      const r = resolveIntegration(integrationId, { credentialKey: credentialKey || null });
      return { source: r.source, why: r.why || null, whyCode: r.whyCode || null, whyParams: r.whyParams || null, missing: Array.isArray(r.missing) ? r.missing.slice() : [], clusterLabel: r.clusterLabel || null, credentialKey: r.credentialKey || null };
    } catch (e) { return { source: 'unknown', why: `integration lookup failed: ${(e && e.message) || e}`, whyCode: 'lookup-failed', whyParams: null, missing: [], clusterLabel: null, credentialKey: credentialKey || null }; }
  }
  /** Every credential a NEW account of this integration may bind to right
   *  now (the store's `offeredCredentials`: key + label only); `[]` without
   *  a store — the wizard then shows no credential step. */
  function offeredCredentials(integrationId) {
    if (!integrationId || !integrations || typeof integrations.offeredCredentials !== 'function') return [];
    try { return integrations.offeredCredentials(integrationId); } catch { return []; }
  }
  /** The key the integration row's OWN pick resolves to — a new account's
   *  default and the honest stamp for a legacy record (the client it minted
   *  its token under is the one the row pointed at). null = nothing resolves. */
  function defaultCredentialKey(integrationId) {
    if (!integrationId || !resolveIntegration) return null;
    try { return resolveIntegration(integrationId).credentialKey || null; } catch { return null; }
  }
  const credentialLabelFor = (integrationId, key) => { const o = key ? offeredCredentials(integrationId).find((c) => c.key === key) : null; return o ? (o.label || null) : null; };
  /** A key the caller names must be one the integration OFFERS right now —
   *  refused `400 unknown-credential` BY NAME with the offered list. */
  function assertOffered(mod, key) {
    if (key === OWN_KEY && rowOf(mod) && rowOf(mod).bindsPerAccount) {
      const err = new Error(`'own' is retired for ${mod.label || mod.kind}: an account carries its own client — choose a preset or 'custom' with the client id and secret`);
      err.status = 400; err.code = 'own-retired'; err.detail = { key };
      throw err;
    }
    const offered = offeredCredentials(mod.integration);
    const hit = offered.find((c) => c.key === key);
    if (hit && hit.available === false) {
      // offered but not fillable yet (the user's own client with fields missing): the wizard
      // opens the Integrations card on this code — never a silent fallback to a preset
      const err = new Error(`'${key}' needs ${(hit.missing || []).join(', ') || 'its fields'} on the Integrations card before an account can use it`);
      err.status = 409; err.code = 'needs-credentials'; err.detail = { key, needsCredentials: true, missing: hit.missing || [] };
      throw err;
    }
    if (hit) return;
    const err = new Error(`'${key}' is not a credential this instance offers for ${mod.label || mod.kind} (offered: ${offered.map((c) => c.key).join(', ') || 'none'})`);
    err.status = 400; err.code = 'unknown-credential'; err.detail = { key, offered: offered.map((c) => c.key) };
    throw err;
  }
  /** THE HONEST STAMP for a record with no `credentialKey` (the
   *  `2026-09-channel-credential-key` migration, a legacy record's
   *  re-authorize): what MINTED its token wins whenever the token says so
   *  and this instance still offers it — a Gmail token records the preset
   *  key it was exchanged under (`clusterKey`; null = the user's own values),
   *  a Lark token records nothing — else the row's own pick (what refreshed
   *  it until now), and the answer NAMES its evidence either way. `boundKey`
   *  = the credential a HELD token provably binds the record to (null when
   *  the token names nothing this instance offers). Verifier r1 (2026-09-22):
   *  stamping the row's pick alone re-bound an org1-minted token to the
   *  channels client the moment the pick had flipped before the upgrade —
   *  the exact case the model exists for. */
  function credentialKeyEvidence(rec, mod) {
    const integrationId = mod && mod.integration;
    const { token, why } = tokensFor(rec).read();
    const named = token && Object.prototype.hasOwnProperty.call(token, 'clusterKey')
      ? (typeof token.clusterKey === 'string' && token.clusterKey ? CLUSTER_PREFIX + token.clusterKey : OWN_KEY) : null;
    // r4: `own` is no longer OFFERED to a new account, but a token minted under
    // the retired card's values is still bound to them — the stamp names
    // `own` while those values are complete, and the reader-side copy moves
    // them onto the record (never a preset the token was not issued under)
    const legacyOwn = named === OWN_KEY && integrations && typeof integrations.legacyOwnValues === 'function' && (() => { try { return integrations.legacyOwnValues(integrationId).ok === true; } catch { return false; } })();
    const boundKey = named && (legacyOwn || offeredCredentials(integrationId).some((c) => c.key === named && c.available !== false)) ? named : null; // an unavailable `own` (listed since r3) never binds
    if (boundKey) return { key: boundKey, evidence: 'token', tokenKey: named, boundKey };
    const pick = defaultCredentialKey(integrationId);
    return { key: pick, evidence: pick ? 'row-pick' : 'nothing-resolves', tokenKey: named, tokenWhy: token ? null : (why || null), boundKey: null };
  }

  // ── connect / re-authorize / disconnect: the user's consent flow ─────────
  /** A CONNECTABLE kind is one with a real module (an integration row, a
   *  consent flow). N ACCOUNTS per kind since 2026-09-22 (the owner's mounts
   *  model): the FIRST record's id IS the kind (every existing record,
   *  conversation, reach entry and filter stays valid untouched); every
   *  further one is `<kind>:<8 hex>` with its own label and credential. */
  function connectableFor(kind) {
    const mod = registry.vendor(kind);
    if (!mod) throw new ChannelError('not-supported', `'${kind}' cannot be connected — it is not a channel adapter with a consent flow (connectable: ${registry.vendors().map((m) => m.kind).join(', ')})`, { retryable: false });
    return mod;
  }
  /** The id of the NEXT account of a kind: the kind itself while no record
   *  carries it, else `<kind>:<8 hex>` — never one already taken. */
  function mintAdapterId(kind, recs) {
    const taken = new Set(recs.adapters.map((r) => r.id));
    if (!taken.has(kind)) return kind;
    for (let i = 0; i < 16; i++) { const id = `${kind}:${crypto.randomBytes(4).toString('hex')}`; if (!taken.has(id)) return id; }
    throw new Error(`could not mint a free adapter id for ${kind}`);
  }
  function newRecord(mod, { id = mod.kind, credentialKey = null } = {}) {
    const c = mod.caps;
    const options = {};
    for (const o of mod.OPTIONS || []) if (o.default !== undefined) options[o.key] = o.default;
    return {
      id, kind: mod.kind, label: mod.label || mod.kind, enabled: true,
      // THE ACCOUNT'S CREDENTIAL BINDING, stamped at connect from the
      // wizard's choice and never re-picked by the row's default afterwards.
      credentialKey: credentialKey || null,
      auth: { tokenEnc: null, expiresAt: null, scopes: [], user: null },
      options, state: {},
      lastPass: null, consecutiveFailures: 0, failureItem: null, lastAuthError: null, lastAuthAt: null,
      // An OPT-IN push lane (decision 20) starts OFF; every other push lane on.
      push: { enabled: c.receive === 'push' && !c.pushOptIn, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] },
      scan: c.receive === 'scan' ? EMPTY_SCAN() : null,
    };
  }
  // ── THE ACCOUNT'S CLIENT CHOICE (r4 §2.2–§2.4) ───────────────────────────
  const httpErr = (status, code, message, detail = null) => { const err = new Error(message); err.status = status; err.code = code; if (detail) err.detail = detail; return err; };
  /** A custom client, validated against the row's two declared fields and
   *  SEALED under `.channels-key` at once — the plaintext never outlives the
   *  request. A complaint names the FIELD and the rule, never the value. */
  function sealCustom(mod, cred) {
    const row = rowOf(mod);
    if (!row || !row.bindsPerAccount) throw httpErr(400, 'invalid-client', `${mod.label || mod.kind} has no per-account client`);
    const cf = R.clientFieldsOf(row);
    const c = cred && typeof cred === 'object' ? cred : {};
    const appId = c.appId != null ? c.appId : c[cf.idKey];
    const appSecret = c.appSecret != null ? c.appSecret : c[cf.secretKey];
    const v = R.validateValues(row, { [cf.idKey]: appId == null ? '' : String(appId), [cf.secretKey]: appSecret == null ? '' : String(appSecret) });
    if (!v.ok) throw httpErr(400, 'invalid-client', `the custom ${row.label} client is invalid — ${Object.entries(v.errors).map(([k, why]) => `${k}: ${why}`).join('; ')}`, { errors: v.errors });
    const missing = R.missingFields(row, v.values);
    if (missing.length) throw httpErr(400, 'invalid-client', `the custom ${row.label} client needs ${missing.join(', ')}`, { missing });
    return { appId: v.values[cf.idKey] || '', appSecretEnc: box.enc(v.values[cf.secretKey]) };
  }
  /** THE CLIENT CHOICE a request names, normalized: `{credentialKey,
   *  credential}` — `cluster:<k>` (also spelled `clientPreset:'<k>'`, the
   *  storage dialog's field), `custom` + `credential {appId, appSecret}`
   *  (also `clientId` + `clientSecret`), validated against what the row
   *  offers RIGHT NOW (`400 unknown-credential` / `invalid-client` / `own-
   *  retired` by name). `null` when the request names none and
   *  `allowDefault` is off (re-authorize keeps the account's own). */
  const PASTE_CHOICE = 'paste';
  function clientChoice(mod, input = {}, { allowDefault = true } = {}) {
    const b = input && typeof input === 'object' ? input : {};
    // 2.369.195: `fromMount` = a storage mount's own client, copied server-side.
    // ONE client per request: beside a preset / custom id / credential it is
    // refused by name (the dialog never sends both — a stale hidden custom
    // input must not decide which client an account signs in under).
    if (namesMount(b)) return clientFromMount(mod, b.fromMount);
    // design 018: a paste row's key-less rung, named — the per-person app (never a preset picked by default)
    if (rowOf(mod) && rowOf(mod).signin === 'paste' && (b.clientPreset === PASTE_CHOICE || b.credentialKey === PASTE_CHOICE)) return { credentialKey: null, credential: null };
    let key = typeof b.credentialKey === 'string' && b.credentialKey ? b.credentialKey : null;
    let cred = b.credential && typeof b.credential === 'object' ? b.credential : null;
    if (!key && typeof b.clientPreset === 'string' && b.clientPreset) key = b.clientPreset === CUSTOM_KEY ? CUSTOM_KEY : CLUSTER_PREFIX + b.clientPreset;
    if ((!key || key === CUSTOM_KEY) && !cred && (b.clientId != null || b.clientSecret != null)) { key = CUSTOM_KEY; cred = { appId: b.clientId, appSecret: b.clientSecret }; }
    if (!key && cred) key = CUSTOM_KEY;
    if (key === CUSTOM_KEY) return { credentialKey: CUSTOM_KEY, credential: sealCustom(mod, cred) };
    if (key) { assertOffered(mod, key); return { credentialKey: key, credential: null }; }
    if (!allowDefault) return null;
    return { credentialKey: defaultCredentialKey(mod.integration), credential: null };
  }
  // ── A STORAGE MOUNT'S CLIENT, BORROWED (2.369.195: "use the OAuth client
  // of a storage mount") ───────────────────────────────────────────────────
  // The mount → channel door the per-account design lacked (the account's
  // client is chosen in the storage dialog's grammar; a custom client typed
  // once for Drive / Gmail-as-a-folder is the SAME Google client). The secret
  // travels ONLY server-side: `mountClients.of` decrypts it with `.mounts-key`
  // (the mounts module owns its key), `sealCustom` validates it against the
  // row's two fields and SEALS it under `.channels-key` in the same call — the
  // account then holds an ordinary `custom` credential {appId, appSecretEnc}.
  // Nothing about it reaches a response body, a frame or a log line; the
  // copy is an audit line naming the mount (never a value).
  /** The mount's client as a `custom` choice — refused BY NAME: the row
   *  borrows no storage client (Lark) / no mounts here / the mount is gone /
   *  holds no custom client / holds another vendor's / cannot be decrypted. */
  /** ONE client per request (verify r1: asked by EVERY verb that reads a
   *  `fromMount` — start / connect / re-authorize AND Connect's own body):
   *  a storage mount named beside a preset / custom id / credential is
   *  refused by name BEFORE anything is read — the dialog never sends both;
   *  a stale hidden custom input must not decide which client an account
   *  signs in under. Returns whether the body names a mount at all. */
  function namesMount(b) {
    if (!(typeof b.fromMount === 'string' && b.fromMount)) return false;
    if (b.credentialKey || b.clientPreset || b.credential || b.clientId != null || b.clientSecret != null) throw httpErr(400, 'ambiguous-client', 'the request names a storage mount\'s client AND another client — name one');
    return true;
  }
  const mountRefusal = (e) => { const code = (e && e.code) || 'mount-no-client'; return httpErr(code === 'mount-gone' ? 404 : code === 'no-mounts' ? 503 : code === 'mount-client-vendor' ? 400 : 409, code, String((e && e.message) || e)); };
  /** THE KEY-LESS HALF of a borrow (verify r2): the row's vendor, the mounts
   *  door, the mount's ID and every refusal that needs no key — gone / no
   *  client / another vendor's (`mountClients.head`, nothing decrypted) —
   *  and the registry's ID RULE (a storage record never validated its id;
   *  an id the row refuses is refused HERE, before the secret is opened).
   *  Returns `{mountId, name, vendor, clientId}`. */
  function mountHead(mod, mountId) {
    const vendor = R.oauthClientVendorOf(rowOf(mod));
    if (!vendor) throw httpErr(400, 'mount-client-unsupported', `${mod.label || mod.kind} signs in with its own app's client — no storage mount holds one`);
    if (!mountClients || typeof mountClients.of !== 'function' || typeof mountClients.head !== 'function') throw httpErr(503, 'no-mounts', 'storage mounts are not available on this instance');
    let h;
    // the vendor rides DOWN (verify r1): the mounts module refuses another vendor's mount BEFORE it
    // opens the secret — nothing is decrypted for a body that is refused, and the refusal names the
    // vendor (an undecryptable OneDrive mount in a Gmail body used to answer `mount-secret-undecryptable`)
    try { h = mountClients.head(String(mountId), { vendor }); }
    catch (e) { throw mountRefusal(e); }
    if (!h || h.vendor !== vendor) throw httpErr(400, 'mount-client-vendor', `the storage mount "${(h && h.name) || mountId}" holds a ${(h && h.vendor) || 'different'} client — ${mod.label || mod.kind} signs in with a ${vendor} one`);
    const row = rowOf(mod);
    const cf = R.clientFieldsOf(row);
    const v = R.validateValues(row, { [cf.idKey]: String(h.clientId || '') });
    if (!v.ok) throw httpErr(400, 'invalid-client', `the storage mount "${h.name}"'s client is not one ${row.label} can use — ${Object.entries(v.errors).map(([k, why]) => `${k}: ${why}`).join('; ')}`, { errors: v.errors });
    return { mountId: h.mountId, name: cleanLabel(h.name), vendor: h.vendor, clientId: String(h.clientId) };
  }
  function clientFromMount(mod, mountId) {
    const h = mountHead(mod, mountId);   // every key-free refusal, before the key is used
    let c;
    try { c = mountClients.of(String(mountId), { vendor: h.vendor }); }
    catch (e) { throw mountRefusal(e); }
    const credential = sealCustom(mod, { appId: c.clientId, appSecret: c.clientSecret });   // the secret's own rule (needs the secret) + the seal
    return { credentialKey: CUSTOM_KEY, credential, fromMount: { mountId: h.mountId, name: h.name } };
  }
  /** The dialog's list (`GET /api/channels/oauth/mount-clients?kind=`): the
   *  mounts whose own client this TYPE can borrow — re-whitelisted here, so
   *  nothing but the five named fields can ever ride the answer. */
  function mountClientsFor(kind) {
    const mod = connectableFor(String(kind || ''));
    const vendor = R.oauthClientVendorOf(rowOf(mod));
    if (!vendor || !mountClients || typeof mountClients.list !== 'function') return { kind: mod.kind, vendor: vendor || null, clients: [] };
    // verify r2: the name and the mailbox are BOUNDED here too (the store caps add()/update() at 60; a hand-edited record is not the dialog's problem)
    const clients = (mountClients.list(vendor) || []).map((x) => ({ mountId: String(x.mountId), name: cleanLabel(x.name), type: x.type ? String(x.type) : null, email: x.email ? cleanLabel(x.email) : null, clientIdPrefix: String(x.clientIdPrefix || '').slice(0, 12) }));
    return { kind: mod.kind, vendor, clients };
  }
  /** verify r3: WHAT WAS COPIED, said back — the answer of every verb that
   *  borrowed a mount's client names the mount and the id's prefix actually
   *  copied (bounded, never a secret). The list's prefix is a hint at list
   *  time; the choice is BY MOUNT and the copy is the mount's client at the
   *  sign-in's START — a mount edited between the list and the pick signs in
   *  under its CURRENT client, and this field (with the audit line) is where
   *  that is told; Connect naming the same mount lands THIS copy (never re-read). */
  function mountNamed(choice) {
    if (!choice || !choice.fromMount) return null;
    return { mountId: String(choice.fromMount.mountId), name: cleanLabel(choice.fromMount.name), clientIdPrefix: String((choice.credential && choice.credential.appId) || '').slice(0, 12) };
  }
  const withMount = (answer, choice) => { const m = mountNamed(choice); return m ? { ...answer, fromMount: m } : answer; };
  /** ONE audit line per copy a verb BEGINS a consent with (start / connect /
   *  re-authorize — Connect's re-check of the same client is not a copy). */
  function auditMountCopy(choice, mod, adapterId = null) {
    if (!choice || !choice.fromMount) return;
    try { store.audit({ kind: 'auth', op: 'client-from-mount', mountId: choice.fromMount.mountId, adapterKind: mod.kind, adapterId, clientIdPrefix: String(choice.credential.appId || '').slice(0, 12), at: now(), by: 'user' }); } catch {}
    log.log(`[channels] ${adapterId || mod.kind}: the OAuth client of storage mount "${cleanLabel(choice.fromMount.name)}" (${choice.fromMount.mountId}) copied onto the ${mod.label || mod.kind} sign-in`);   // verify r2: one line, the name bounded (a newline in a name forged a journal line)
  }
  /** Does the account already hold THIS client? (a same-id custom client
   *  with a new secret is the same client — its secret is replaced in place) */
  function sameClient(rec, choice) {
    if ((rec.credentialKey || null) !== choice.credentialKey) return false;
    if (choice.credentialKey !== CUSTOM_KEY) return true;
    return !!(rec.credential && String(rec.credential.appId || '') === String(choice.credential.appId || ''));
  }
  /** Refuse, BEFORE anything begins, a choice that resolves to no usable
   *  client (the adapter's typed `auth-expired {needsCredentials}` shape the
   *  route maps to 409). */
  function assertResolvable(mod, rec) {
    const f = credentialFactsFor(rec);
    if (f.source === 'none' || f.source === 'unknown' || (Array.isArray(f.missing) && f.missing.length)) {
      throw new ChannelError('auth-expired', `cannot start a ${mod.label || mod.kind} consent flow: ${f.why || 'no application credential is configured'}`, { retryable: false, detail: { needsCredentials: true, missing: f.missing || [], code: f.whyCode || undefined } });
    }
  }
  /** The options AS APPLIED: an adapter that derives one option from
   *  another (Gmail: a custom query on an unset scope IS the query scope)
   *  exports `effectiveOptions`, so the panel's health line and the Edit
   *  dialog say what the adapter really reads, never a stored default. */
  function viewOptions(mod, rec) {
    const o = { ...(rec.options || {}) };
    if (mod && typeof mod.effectiveOptions === 'function') { try { return { ...mod.effectiveOptions(o) }; } catch { return o; } }
    return o;
  }
  /** A request's per-type fields (the adapter's declared OPTIONS), checked
   *  exactly as `setOptions` checks them. */
  function normalizeOptions(mod, patch, base = {}) {
    const decls = (mod && mod.OPTIONS) || [];
    if (patch == null) return { ...base };
    if (typeof patch !== 'object' || Array.isArray(patch)) throw httpErr(400, 'bad-request', 'options must be an object');
    const next = { ...base };
    for (const [k, raw] of Object.entries(patch)) {
      const d = decls.find((o) => o.key === k);
      if (!d) throw httpErr(400, 'unknown-option', `'${k}' is not an option of ${mod.label || mod.kind} (declared: ${decls.map((o) => o.key).join(', ') || 'none'})`);
      if (raw === null || raw === undefined) continue;
      if (typeof raw !== 'string') throw httpErr(400, 'bad-request', `'${k}' must be a string`);
      const v = raw.trim();
      if (v.length > (d.maxLength || 500)) throw httpErr(400, 'bad-request', `'${k}' is longer than ${d.maxLength || 500} characters`);
      const val = v || (d.default !== undefined ? d.default : '');
      if (Array.isArray(d.choices) && d.choices.length && !d.choices.includes(val)) throw httpErr(400, 'bad-request', `'${k}' must be one of ${d.choices.join(', ')} (got '${val}')`);
      next[k] = val;
    }
    return next;
  }
  const cleanLabel = (name) => String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

  // ── THE TRANSIENT CONSENT FLOW: signed in BEFORE the account exists ──────
  // The storage dialog's shape (`/api/mounts/gdrive-auth/{start,status,
  // callback}`): the dialog's sign-in block starts a flow for a CHOICE of
  // client, the adapter's OWN begin/exchange runs against a record that
  // exists only in memory (id `pending:<hex>`, its token sealed in memory),
  // and `connect({flowId})` creates the record at that moment — a dialog
  // closed half-way leaves nothing behind. The same machine carries a
  // RE-AUTHORIZE THAT SWITCHES THE CLIENT (`target`): the account keeps its
  // old client and token until the consent under the new client lands, then
  // both are replaced in ONE write — never a record bound to a client its
  // token was not issued under.
  const pendingFlows = new Map();   // flowId -> pending
  function sweepPending() {
    const t = now();
    for (const [id, p] of pendingFlows) if (t - p.startedAt > PENDING_FLOW_TTL_MS) { try { flows.cancel(id, 'expired'); } catch {} pendingFlows.delete(id); }
  }
  const latestPending = () => { let best = null; for (const p of pendingFlows.values()) if (!p.targetId && (!best || p.startedAt >= best.startedAt)) best = p; return best; };
  /** verify r8: does the pending flow's TARGET hold a sign-in right now (the refusal's tail says so). */
  const targetHolds = (p) => { const t = p.targetId ? adapterRecords().adapters.find((x) => x.id === p.targetId) : null; return !!(t && t.auth && t.auth.tokenEnc); };
  async function beginPending(mod, choice, { target = null, options = null, origin = null } = {}) {
    sweepPending();
    const id = target ? target.id : `pending:${crypto.randomBytes(6).toString('hex')}`;
    const rec = newRecord(mod, { id, credentialKey: choice.credentialKey });
    if (choice.credential) rec.credential = choice.credential;
    rec.options = normalizeOptions(mod, options, target ? { ...(target.options || {}) } : rec.options);
    if (target) rec.label = target.label;
    assertResolvable(mod, rec);
    const p = { flowId: null, kind: mod.kind, choice, rec, targetId: target ? target.id : null, tokenEnc: null, tokenMeta: null, done: false, ok: null, error: null, user: null, startedAt: now(), adapter: null };
    const memTokens = {
      read() {
        if (!p.tokenEnc) return { token: null, why: 'never-authenticated' };
        try { return { token: JSON.parse(box.dec(p.tokenEnc)), why: null }; } catch (e) { return { token: null, why: `token-undecryptable: ${(e && e.message) || e}` }; }
      },
      async write(token, meta = {}) {
        // verify r7: a consent cancelled meanwhile writes nothing; a consent naming nobody is refused here too
        // (verify r8: the engine's stop is a cancel too; the sentence says whether the TARGET keeps a sign-in)
        const c = (meta.consent && typeof meta.consent.cancelled === 'function' ? meta.consent.cancelled() : null) || (engineCtx.stopped ? 'shutdown' : null);
        if (c) throw new ChannelError('auth-expired', cancelledSentence(rec.label || rec.id, String(c), targetHolds(p)), { retryable: false, detail: { cancelled: String(c) } });
        const offered = identityOf(token);
        if (meta.consent && !Object.keys(offered).length) throw new ChannelError('forbidden', namelessSentence(rec.label || rec.id, 'the sign-in named no account'), { retryable: false, detail: { nameless: true } });
        p.tokenEnc = box.enc(JSON.stringify(token));
        p.identity = offered;   // verify r5: judged against the target's held identity when the rebind lands
        p.tokenMeta = { expiresAt: meta.expiresAt == null ? null : Number(meta.expiresAt), scopes: Array.isArray(meta.scopes) ? meta.scopes.slice() : [], user: meta.user || token.name || token.email || token.openId || null, refusedScopes: refusedScopesOf(meta.refusedScopes) };
      },
      async clear() { p.tokenEnc = null; p.tokenMeta = null; },
    };
    const memState = { read: () => ({}), write: async () => {} };
    p.adapter = registry.create(mod.kind, rec, { now, resolveIntegration: resolverFor(rec), fetch: fetchFn, log, tokens: memTokens, state: memState, oauth: flows, consent: consentDepsOf(mod.kind), onAuthDone: (_id, r) => onPendingDone(p, r), deliver, liveSessions, credentialKey: rec.credentialKey || null });
    const flow = await p.adapter.auth.begin({ origin });   // design 018: the browser's own origin rides the Slack state (the relay's way back)
    p.flowId = flow.flowId;
    pendingFlows.set(p.flowId, p);
    return { flowId: p.flowId, kind: mod.kind, credentialKey: choice.credentialKey, flow: safeFlow(flow) };
  }
  async function onPendingDone(p, r) {
    // verify r8: NOTHING is written after stop — the pending's durable write (applyRebind / Connect) is dropped
    if (engineCtx.stopped) { pendingFlows.delete(p.flowId); log.log(`[channels] ${p.targetId || p.kind}: a sign-in completed after the engine stopped — nothing is written after stop (${r && r.ok ? 'its consent is not applied' : (r && r.error) || 'the consent flow failed'}); sign in again after the restart`); return; }
    p.done = true;
    p.cancelled = (r && r.cancelled) || null;
    // verify r7: a flow cancelled mid-exchange is not a consent. verify r8: HERE the durable write is still ahead
    // (applyRebind / Connect), so a cancel the loopback carried beside ok:true — it arrived after the MEMORY write —
    // still wins; the record's own door is the opposite case (its write is the fact, `onAuthDone` reads ok as landed)
    p.ok = !!(r && r.ok) && !!p.tokenEnc && !p.cancelled;
    p.error = p.ok ? null : (p.cancelled && !(r && r.error) ? cancelledSentence(p.rec.label || p.targetId || p.kind, p.cancelled, targetHolds(p)) : String((r && r.error) || 'the consent flow failed'));
    p.user = (p.tokenMeta && p.tokenMeta.user) || (r && r.result && r.result.user) || null;
    if (p.targetId && r && r.cancelled === 'superseded') { pendingFlows.delete(p.flowId); log.log(`[channels] ${p.targetId}: an older re-authorize completed after a newer one and was refused — the newer sign-in stands`); return; }   // verify r7
    if (p.targetId) return applyRebind(p);
    if (p.ok) log.log(`[channels] ${p.kind}: signed in${p.user ? ` as ${p.user}` : ''} (${p.choice.credentialKey}) — waiting for Connect`);
    else log.warn(`[channels] ${p.kind}: consent flow failed: ${p.error}`);
  }
  /** The switched-client re-authorize LANDS: client + token in ONE write. */
  async function applyRebind(p) {
    pendingFlows.delete(p.flowId);
    const rec = adapterRecords().adapters.find((x) => x.id === p.targetId);
    if (!rec) { log.warn(`[channels] ${p.targetId}: re-authorize finished for an account that is gone`); return; }
    if (!p.ok) {
      await store.adapters.update(() => { rec.lastAuthError = p.error; rec.lastAuthAt = now(); });
      log.warn(`[channels] ${rec.id}: re-authorize under ${p.choice.credentialKey} failed: ${p.error} — the account keeps its client and token`);
      if (!engineCtx.stopped) notify([]);
      return;
    }
    // verify r5 (credential): a rebind whose consent names ANOTHER identity than the account's keeps client and token
    // (r6: the held identity read off the token the record holds; a consent naming nobody onto a held identity refused)
    const held = heldIdentity(rec, tokensFor(rec).read().token);
    const offered = p.identity || {};
    const mm = identityMismatch(held, offered) || (Object.keys(held).length && !Object.keys(offered).length ? { nameless: true } : null);
    if (mm) {
      const s = mm.nameless ? namelessSentence(rec.label || rec.id, 'the sign-in named no account') : mismatchSentence(rec.label || rec.id, mm);
      p.ok = false; p.error = s;   // slack-workspace-app verify r1: the pending says it too (the GET landing page / a paste-back answer read it — they said "connected" over this refusal)
      await store.adapters.update(() => { rec.lastAuthError = s; rec.lastAuthAt = now(); });
      log.warn(`[channels] ${rec.id}: re-authorize under ${p.choice.credentialKey} refused: ${s} — the account keeps its client and token`);
      if (!engineCtx.stopped) notify([]);
      return;
    }
    await store.adapters.update(() => {
      rec.credentialKey = p.choice.credentialKey;
      if (p.choice.credential) rec.credential = p.choice.credential; else delete rec.credential;
      rec.auth = { ...(rec.auth || {}), tokenEnc: p.tokenEnc, expiresAt: p.tokenMeta.expiresAt, scopes: p.tokenMeta.scopes, user: p.tokenMeta.user || (rec.auth && rec.auth.user) || null, updatedAt: now(), scopesAt: now(), refusedScopes: p.tokenMeta.refusedScopes || [] };
      if (p.identity && Object.keys(p.identity).length) rec.identity = { ...(rec.identity || {}), ...p.identity };
      rec.lastAuthError = null; rec.lastAuthAt = now();
    });
    dropLive(rec.id, 'client switched');
    log.log(`[channels] ${rec.id}: re-authorized under ${rec.credentialKey}${rec.auth.user ? ` as ${rec.auth.user}` : ''}`);
    const e = adapterFor(rec);
    await refreshAuth(e);
    e.failures = 0; e.nextAt = 0; e.rateStrikes = 0; e.backoffKind = null;
    await retractFailure(rec);
    await rejudgeConvCaps(rec, 're-authorized');   // inc-muk9jj0j-rel3: every conversation, BEFORE the one whole digest
    if (!engineCtx.stopped) notify([]);
    if (!engineCtx.stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after re-authorize failed:', err && err.message));
    if (!engineCtx.stopped && engineCtx.timer) syncPushLanes().catch(() => {});
  }
  /** START a consent for an account that does not exist yet:
   *  `{kind, clientPreset | credentialKey | clientId + clientSecret |
   *  credential, options?}` → `{flowId, url, flow}`. */
  async function startOAuth(input = {}) {
    const mod = connectableFor(String(input.kind || input.backend || ''));
    normalizeOptions(mod, input.options, {});   // verify r2: a body refused on its options never opens a mount's secret (judged again, on the record, in beginPending)
    const choice = clientChoice(mod, input);
    const r = await beginPending(mod, choice, { options: input.options, origin: typeof input.origin === 'string' ? input.origin : null });
    auditMountCopy(choice, mod);
    return withMount({ ...r, url: r.flow && r.flow.consentUrl }, choice);   // verify r3: the answer names the client copied
  }
  function pendingOrThrow(flowId) {
    sweepPending();
    const p = flowId ? pendingFlows.get(String(flowId)) : latestPending();
    if (!p || p.targetId) throw httpErr(404, 'no-flow', 'no sign-in in progress — start one with the account dialog\'s sign-in button');
    return p;
  }
  /** STATUS: `token` is the FLOW ID once the sign-in succeeded — the handle
   *  the shared consent block writes into its field and the dialog submits
   *  with Connect (the storage block's contract); never a credential. */
  function oauthStatus(flowId = null) {
    const p = pendingOrThrow(flowId);
    const st = flows.status(p.flowId);
    const cancelled = st && st.cancelled ? st.cancelled : null;
    return {
      flowId: p.flowId, kind: p.kind, credentialKey: p.choice.credentialKey,
      running: !p.done && !!(st && st.running), done: p.done, ok: p.done ? p.ok : null,
      // verify r4: an end that is the consent machine's own act (the timeout, the cap) carries ITS sentence on the flow;
      // a flow the machine no longer knows (retired under this record) is SAID too, never a wordless stop
      error: p.error || (cancelled && !p.done ? ((st && st.error) || `the sign-in was ${cancelled === 'timeout' ? 'not finished in time' : cancelled}`) : (!p.done && !st ? 'the sign-in is no longer running — sign in again' : null)),
      user: p.user, flow: safeFlow(st), token: p.done && p.ok ? p.flowId : null,
    };
  }
  /** lane dc-channels-consent: the landing PAGE of `kind` — its consent row's `landing.landingHtml(r)`, or null (an
   *  account type whose consent never lands here: the route answers 404 by name). */
  function consentLandingOf(kind) { const row = consentRowOf(String(kind || '')); return row && row.landing ? row.landing.landingHtml : null; }
  /** design 018: THE LANDING ROUTE (`GET /api/channels/oauth/cb/:kind?code&state[&error]`) — the browser the vendor (or
   *  its relay page) sent back. The state is judged FIRST by `kind`'s declared row (shape, this boot's HMAC, its age), then
   *  the flow it names must be a running consent of `kind`, found by the WHOLE state (oauth-loopback `finishByState`): a
   *  code is exchanged at most once. A kind with no landing row is `wrong-flow`. → `{ok, why, user, error}` — never the
   *  code, the state or a secret; refusals in the row's closed list + used. */
  async function oauthLanding({ kind, code = null, state = null, error = null } = {}) {
    const row = consentRowOf(String(kind || ''));
    if (!row || !row.landing) { log.warn(`[channels] ${String(kind).slice(0, 20)}: a consent landing for an account type that declares none (wrong-flow)`); return { ok: false, why: 'wrong-flow', user: null, error: null }; }
    const v = row.landing.stateVerdict(state, { sign: signState, now: now(), ttlMs: PENDING_FLOW_TTL_MS });
    if (!v.ok) { log.warn(`[channels] ${String(kind).slice(0, 20)}: a consent landing was refused (${v.why})`); return { ok: false, why: v.why, user: null, error: null }; }
    const st = flows.status(v.parts.flowId);
    const p = pendingFlows.get(v.parts.flowId) || null;
    const owner = p ? p.kind : (st ? ((adapterRecords().adapters.find((r) => r.id === st.id) || {}).kind || null) : null);
    if (!st || owner !== kind) { log.warn(`[channels] ${String(kind).slice(0, 20)}: a consent landing named no running ${String(kind).slice(0, 20)} sign-in (wrong-flow)`); return { ok: false, why: 'wrong-flow', user: null, error: null }; }
    const r = await flows.finishByState(state, code, { error });
    // verify r1: the exchange landed but the pending's own step refused it (a re-point onto ANOTHER Slack person /
    // workspace: applyRebind keeps the record's client + token) — the page says that refusal, never "connected"
    const refused = !!r.ok && !!p && p.ok === false;
    const ok = !!r.ok && !refused;
    if (!ok) log.warn(`[channels] ${st.id}: a consent landing ended ${refused ? 'refused' : (r.why || 'failed')}`);
    // slack-landing-nologin verify r1: the page is COOKIE-FREE (2.369.214) and the browser holding the state may be a
    // stranger's — a re-authorize's refusal names the account it guards (its label, the HELD Slack identity beside the
    // offered one), so a landing on an EXISTING account's flow says fixed words; the owner's window keeps the sentence
    const onRecord = p ? !!p.targetId : true;
    return { ok, why: ok ? null : (refused ? 'failed' : (r.why || 'failed')), user: ok && r.result ? (r.result.user || null) : null, error: ok ? null : (onRecord ? 'the account was not changed — the VibeSpace window where you pressed Re-authorize says why' : (refused ? (p.error || 'the sign-in was refused') : (r.error || null))) };
  }
  /** PASTE-BACK for a pending flow: the redirect URL the browser landed on. design 017: `box` = which box of a
   *  stepped paste card it came from; a STEP that landed (`step`) answers its public facts and NO token — the sign-in
   *  is not finished; a refusal carries its closed `why` (`detail.code`) for the card's words. */
  async function oauthCallback({ url, flowId = null, box = null } = {}) {
    const p = pendingOrThrow(flowId);
    if (!url || typeof url !== 'string') throw httpErr(400, 'bad-request', 'url is required (the redirect URL your browser landed on)');
    let r;
    try { r = await p.adapter.auth.finish(p.flowId, url, { box: typeof box === 'string' ? box : null }); }
    catch (e) {
      if (e && e.status) throw e;
      const err = httpErr(400, (e && e.code) || 'bad-callback', String((e && e.message) || e));
      if (e && e.detail && typeof e.detail.why === 'string') err.detail = { code: e.detail.why };
      throw err;
    }
    if (r && r.ok && r.step) return { ok: true, error: null, flowId: p.flowId, step: r.step, stepFacts: r.stepFacts || null, user: null, token: null };
    const ok = !!(r && r.ok) && p.ok !== false;
    return { ok, error: ok ? null : ((r && r.error) || p.error || 'the consent flow failed'), why: ok ? null : ((r && r.why) || null), flowId: p.flowId, user: p.user, token: ok ? p.flowId : null };
  }

  /** CONNECT (r4): with `flowId` — THE account dialog's Connect — the record
   *  is CREATED here from a finished sign-in: its client is the flow's (a
   *  body naming another is `400 flow-client-mismatch`), its token the one
   *  that flow minted, `{name, options}` from the dialog; the flow is taken
   *  ONCE. Without `flowId` — the pre-r4 wizard path — a record is minted
   *  (always with `newAccount`, or when the type has none yet) under the
   *  choice (`cluster:<k>` / `custom` + credential; omitted = the row's
   *  pick) and its consent begins; without `newAccount` on a type that has
   *  an account, the FIRST account is re-authorized. */
  async function connect(kind, input = {}) {
    const b = input && typeof input === 'object' ? input : {};
    const mod = connectableFor(kind);
    if (b.flowId) return connectFromFlow(mod, b);
    const recs = adapterRecords();
    const existing = recs.adapters.filter((r) => r.kind === kind);
    if (!b.newAccount && existing.length) return reauthorize((existing.find((r) => r.id === kind) || existing[0]).id, b);
    // THE CREDENTIAL QUESTION IS ASKED BEFORE A RECORD EXISTS (the r2 ④
    // rule): a record nobody can connect is never minted.
    normalizeOptions(mod, b.options, {});   // verify r2: the options first — a body refused on them never opens a mount's secret
    const choice = clientChoice(mod, b);
    const rec = newRecord(mod, { id: mintAdapterId(kind, recs), credentialKey: choice.credentialKey });
    if (choice.credential) rec.credential = choice.credential;
    rec.options = normalizeOptions(mod, b.options, rec.options);
    if (b.name) rec.label = cleanLabel(b.name) || rec.label;
    assertResolvable(mod, rec);
    const e = adapterFor(rec);
    let flow;
    try { flow = await e.adapter.auth.begin(); }
    catch (err) { dropLive(rec.id, 'connect refused'); paceCarry.delete(rec.id); throw err; }   // a refused begin on a fresh record leaves nothing behind (not even its ghost bucket)
    await store.adapters.update((a) => { a.adapters.push(rec); });
    auditMountCopy(choice, mod, rec.id);
    notify([]);
    return withMount({ adapter: adapterView(rec), flow: safeFlow(flow) }, choice);
  }
  async function connectFromFlow(mod, b) {
    sweepPending();
    const p = pendingFlows.get(String(b.flowId));
    if (!p || p.targetId) throw httpErr(404, 'no-flow', 'no finished sign-in with that id — sign in again from the account dialog');
    if (p.kind !== mod.kind) throw httpErr(400, 'flow-kind-mismatch', `that sign-in was for ${p.kind}, not ${mod.kind}`);
    // verify r4: a sign-in that is neither finished nor running any more (ended under this record, or retired by the
    // machine) is refused as ENDED, by its own sentence — not as "not finished yet"
    const live = flows.status(p.flowId);
    if (!p.done && !(live && live.running)) throw httpErr(409, 'flow-failed', `the sign-in ended before it finished: ${(live && (live.error || live.cancelled)) || 'it is no longer running'} — sign in again`);
    if (!p.done) throw httpErr(409, 'flow-not-done', 'the sign-in has not finished yet — approve access on the sign-in page (or paste the redirect URL back) first');
    if (!p.ok) throw httpErr(409, 'flow-failed', `the sign-in failed: ${p.error || 'unknown'} — sign in again`);
    // verify r2: EVERY refusal that needs neither a key nor the flow comes first — the options are
    // judged before the flow is taken (a Connect refused for a bad option used to CONSUME the finished
    // sign-in: the next Connect answered no-flow and the consent had to be run again)
    const options = normalizeOptions(mod, b.options, p.rec.options);
    // 2.369.195: Connect naming the SAME storage mount the sign-in began with IS the flow's client
    // (the copy the consent ran under) — never re-read, so a mount edited or removed meanwhile cannot
    // turn a finished sign-in into a refusal; another mount is resolved and compared like any client
    // (verify r1: the ONE-client rule is asked here too — a stale preset / custom field beside the mount is refused, never ignored)
    const sameMount = namesMount(b) && !!p.choice.fromMount && p.choice.fromMount.mountId === b.fromMount;
    const mismatch = (now_) => httpErr(400, 'flow-client-mismatch', `that sign-in ran under ${p.choice.fromMount ? `the client of storage mount "${p.choice.fromMount.name}"` : p.choice.credentialKey}; the dialog now names ${now_} — a token is bound to the client it was issued under, so sign in again under the new client`);
    let named = null;
    if (!sameMount && namesMount(b)) {
      // verify r2: ANOTHER mount is compared BY ID first (the key-less read) — a mount whose id is not the
      // flow's client is refused with nothing decrypted, and the refusal names the mismatch, never the
      // other mount's key state (an undecryptable other mount used to answer `mount-secret-undecryptable`)
      const h = mountHead(mod, b.fromMount);
      if (p.choice.credentialKey !== CUSTOM_KEY || String(h.clientId) !== String(p.choice.credential.appId)) throw mismatch(`the client of storage mount "${h.name}"`);
      named = clientFromMount(mod, b.fromMount);   // the same id: the secrets are compared (needs the key)
    } else if (!sameMount) named = clientChoice(mod, b, { allowDefault: false });
    if (named && (named.credentialKey !== p.choice.credentialKey || (named.credentialKey === CUSTOM_KEY && (String(named.credential.appId) !== String(p.choice.credential.appId) || box.dec(named.credential.appSecretEnc) !== box.dec(p.choice.credential.appSecretEnc))))) {
      throw mismatch(named.fromMount ? `the client of storage mount "${named.fromMount.name}"` : named.credentialKey);
    }
    pendingFlows.delete(p.flowId);   // taken ONCE — after every refusal above
    const recs = adapterRecords();
    const rec = newRecord(mod, { id: mintAdapterId(mod.kind, recs), credentialKey: p.choice.credentialKey });
    if (p.choice.credential) rec.credential = p.choice.credential;
    rec.options = options;
    if (b.name) rec.label = cleanLabel(b.name) || rec.label;
    rec.auth = { tokenEnc: p.tokenEnc, expiresAt: p.tokenMeta.expiresAt, scopes: p.tokenMeta.scopes, user: p.tokenMeta.user || null, updatedAt: now(), refusedScopes: p.tokenMeta.refusedScopes || [] };
    if (p.identity && Object.keys(p.identity).length) rec.identity = { ...p.identity };   // verify r5: whose account this record is, from its first consent
    rec.lastAuthAt = now();
    await store.adapters.update((a) => { a.adapters.push(rec); });
    const e = adapterFor(rec);
    await refreshAuth(e);
    log.log(`[channels] ${rec.id}: connected${rec.auth.user ? ` as ${rec.auth.user}` : ''} (${rec.credentialKey})`);
    notify([]);
    if (!engineCtx.stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after connect failed:', err && err.message));
    if (!engineCtx.stopped && engineCtx.timer) syncPushLanes().catch(() => {});
    return withMount({ adapter: adapterView(rec), flow: null }, p.choice);   // verify r3: which mount's client this account was minted under
  }
  /** RE-AUTHORIZE one ACCOUNT by its adapter id (the mount semantics, r4
   *  §2.4): the SAME client ⇒ its consent begins under it (a custom client
   *  with the same id and a new secret replaces the secret first); a
   *  DIFFERENT client IS a re-authorization under it — the consent runs as a
   *  pending flow and the account's client AND token are replaced together
   *  when it lands (`rebind:true`). The pre-r4 `credential-bound` refusal is
   *  gone: switching the client is exactly what this verb is for. A legacy
   *  record with no key is stamped by `credentialKeyEvidence` first. */
  async function reauthorize(adapterId, input = {}) {
    const rec = recordOrThrow(adapterId);
    const mod = connectableFor(rec.kind);
    const choice = clientChoice(mod, input, { allowDefault: false });
    const origin = typeof input.origin === 'string' ? input.origin : null;
    if (!choice && !rec.credentialKey && !(rowOf(mod) && rowOf(mod).signin === 'paste')) {   // design 018: a key-less Slack account IS the paste rung — never stamped with a preset
      const ev = credentialKeyEvidence(rec, mod);
      if (ev.key) await store.adapters.update(() => { rec.credentialKey = ev.key; });
    }
    if (rec.enabled === false) await store.adapters.update(() => { rec.enabled = true; });
    if (choice && !sameClient(rec, choice)) {
      const r = await beginPending(mod, choice, { target: rec, origin });
      auditMountCopy(choice, mod, rec.id);
      await store.adapters.update(() => { rec.lastAuthError = null; });
      notify([]);
      return withMount({ adapter: adapterView(rec), flow: r.flow, rebind: true, credentialKey: choice.credentialKey }, choice);
    }
    if (choice && choice.credentialKey === CUSTOM_KEY) await store.adapters.update(() => { rec.credential = choice.credential; });   // same id, the secret replaced in place
    auditMountCopy(choice, mod, rec.id);
    if (rec.credentialKey === OWN_KEY) await inlineLegacyClient(rec);
    const e = adapterFor(rec);
    assertResolvable(mod, rec);
    const flow = await e.adapter.auth.begin({ origin });
    await store.adapters.update(() => { rec.lastAuthError = null; });
    notify([]);
    return withMount({ adapter: adapterView(rec), flow: safeFlow(flow) }, choice);
  }
  function recordOrThrow(adapterId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) { const err = new Error(`no such adapter '${adapterId}'`); err.status = 404; err.code = 'no-such-adapter'; throw err; }
    return rec;
  }
  /** What the wire may carry about a running flow: never the `state`
   *  secret, never the exchange result. */
  function safeFlow(st) {
    if (!st) return null;
    return { flowId: st.flowId, mode: st.mode, running: !!st.running, done: !!st.done, ok: st.ok, error: st.error || null, why: st.why || null, cancelled: st.cancelled || null, step: st.step || null, stepFacts: st.stepFacts && typeof st.stepFacts === 'object' ? { ...st.stepFacts } : null, consentUrl: st.consentUrl, redirectUri: st.redirectUri, port: st.port, listening: !!st.listening, refusal: st.refusal || null, pasteBack: true, startedAt: st.startedAt, expiresAt: st.expiresAt, optional: Array.isArray(st.optional) ? st.optional.slice() : [], narrowed: Array.isArray(st.narrowed) ? st.narrowed.slice() : null, groups: Array.isArray(st.groups) ? st.groups.map((g) => (Array.isArray(g) ? g.slice() : [])) : [], nextNarrow: Array.isArray(st.nextNarrow) ? st.nextNarrow.slice() : null };
  }
  /** Paste-back (§12.4): the user pastes the redirect URL their browser
   *  landed on; the adapter's own `auth.finish` runs the state check. A
   *  switched-client re-authorize runs through the SAME route (its pending
   *  flow is filed under the account's id). */
  async function finishAuth(adapterId, url) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    if (!running) throw new ChannelError('not-supported', `no consent flow is running for ${rec.label || rec.id} — start one with Connect`, { retryable: false, detail: { code: 'no-flow' } });
    const p = pendingFlows.get(running.flowId);
    const a = p ? p.adapter : adapterFor(rec).adapter;
    const r = await a.auth.finish(running.flowId, url);
    // slack-workspace-app verify r1: a re-point the rebind refused (another identity) is not ok — the dialog toasted "re-authorized" over it
    if (r.ok && p && p.ok === false) return { ok: false, error: p.error || 'the sign-in was refused' };
    return { ok: !!r.ok, error: r.error || null };
  }
  /** THE ONE NARROWING RETRY (owner ruling 2026-09-28) of an account's running sign-in: the vendor refused the
   *  consent on its own page because the app has not enabled an optional scope — the same flow gets a consent URL
   *  without it, once (`already-narrowed` after). → `{flow}` (the new consent URL). */
  function narrowAuth(adapterId) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    if (!running) throw httpErr(404, 'no-flow', `no sign-in is running for ${rec.label || rec.id} — start one with Re-authorize`);
    return { flow: safeFlow(narrowFlow(running.flowId)) };
  }
  /** …the same for a sign-in that runs BEFORE its account exists (the account dialog's Connect). */
  function oauthNarrow(flowId = null) {
    const p = pendingOrThrow(flowId);
    return { flowId: p.flowId, flow: safeFlow(narrowFlow(p.flowId)) };
  }
  function narrowFlow(flowId) {
    if (typeof flows.narrow !== 'function') throw httpErr(501, 'not-supported', 'this consent machine cannot retry a sign-in without its optional scopes');
    try { return flows.narrow(flowId); }
    catch (e) { throw httpErr(e && e.code === 'no-flow' ? 404 : 409, (e && e.code) || 'bad-request', String((e && e.message) || e)); }
  }
  async function cancelAuth(adapterId) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    const cancelled = running ? flows.cancel(running.flowId, 'cancelled') : false;
    if (running) pendingFlows.delete(running.flowId);
    notify([]);
    return { ok: true, cancelled };
  }
  /** The adapter reports the flow's end (the loopback's `onDone`, through
   *  the adapter): a success re-asks auth and kicks a pass; a failure is
   *  SAID on the record (`lastAuthError`) — never swallowed. */
  async function onAuthDone(adapterId, r) {
    const rec = adapterRecords().adapters.find((x) => x.id === adapterId);
    if (!rec) return;
    // verify r8: NOTHING is written after stop — the door refused the late exchange by name (`shutdown`) or its
    // consent had already landed; either way the record is left as it is and the next boot reads it
    if (engineCtx.stopped) { log.log(`[channels] ${rec.id}: a sign-in completed after the engine stopped — nothing is written after stop (${r && r.ok ? 'its consent had landed and stands' : (r && r.error) || 'the consent flow failed'})`); return; }
    // verify r7: a flow a NEWER sign-in superseded and REFUSED reports its end AFTER the newer one landed — its refusal
    // is not the record's last sign-in line (the connected record used to wear "replaced by a newer sign-in" as an
    // error). verify r8: one whose consent LANDED before the newer began is a landed consent — the write is the fact
    if (r && !r.ok && r.cancelled === 'superseded') { log.log(`[channels] ${rec.id}: an older sign-in completed after a newer one and was refused (${r.error || 'superseded'}) — the newer sign-in stands`); return; }
    await store.adapters.update(() => { rec.lastAuthError = r && r.ok ? null : String((r && r.error) || 'the consent flow failed'); rec.lastAuthAt = now(); });
    const e = adapterFor(rec);
    await refreshAuth(e);
    // verify r8: THE WRITE IS THE FACT, and so is what came after it — a consent that landed and was DISCONNECTED
    // before this report (the clear() behind it in the store's chain) is not "connected": no pass, no connected line
    if (r && r.ok && !(rec.auth && rec.auth.tokenEnc)) { log.log(`[channels] ${rec.id}: the sign-in landed and the account was disconnected since — the disconnect stands`); if (!engineCtx.stopped) notify([]); return; }
    if (r && r.ok) { e.failures = 0; e.nextAt = 0; e.rateStrikes = 0; e.backoffKind = null; }
    if (r && r.ok) log.log(`[channels] ${rec.id}: connected${rec.auth && rec.auth.user ? ` as ${rec.auth.user}` : ''}`);
    else log.warn(`[channels] ${rec.id}: consent flow failed: ${(r && r.error) || 'unknown'}`);
    // inc-muk9jj0j-rel3: A CONSENT CHANGES WHAT EVERY CONVERSATION MAY DO — re-judged HERE, at the write, for the whole
    // account (the pass below visits only what is due), then ONE whole digest carries the fresh verdicts
    if (r && r.ok) await rejudgeConvCaps(rec, 'connected');
    if (!engineCtx.stopped) notify([]);
    if (r && r.ok && !engineCtx.stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after connect failed:', err && err.message));
    if (r && r.ok && !engineCtx.stopped && engineCtx.timer) syncPushLanes().catch(() => {});   // a fresh consent may be what the lane was waiting for
  }
  /** DISCONNECT = drop the token, for EVERY account (r4 §4: the pre-r4
   *  "a further account's disconnect removes it" special case is gone —
   *  REMOVE is its own verb with its own reference check). The record, its
   *  client, its conversations, assignments and grants stay; a later
   *  Re-authorize resumes them. Any running flow is cancelled. */
  async function disconnect(adapterId) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    if (running) { flows.cancel(running.flowId, 'cancelled'); pendingFlows.delete(running.flowId); }
    // verify r4: THE exit, BEFORE the token goes — every queued paced call is aborted by name (18 × 20 units used to leave
    // with the Bearer captured before the wait), the pass in flight ends at its next step, the lane cannot outlive its credential
    dropLive(rec.id, 'disconnected');
    await tokensFor(rec).clear();
    await store.adapters.update(() => { rec.lastAuthError = null; rec.state = {}; rec.lastPass = null; delete rec.lastOkAt; rec.consecutiveFailures = 0; });
    await retractFailure(rec);
    const e = adapterFor(rec);   // rebuilt at once (its buckets carried) so the card answers the adapter's own `unknown`
    e.failures = 0; e.nextAt = 0; e.rateStrikes = 0; e.backoffKind = null; await refreshAuth(e);
    await rejudgeConvCaps(rec, 'disconnected');   // inc-muk9jj0j-rel3: no credential ⇒ nothing sends, said everywhere at once
    notify([]);
    return { ok: true };
  }
  /** WHAT STILL POINTS AT AN ACCOUNT (r4 §8.1 #5, D5): the ACCESS rows of
   *  its three grains (R4 — a watcher always has one, so a notification is
   *  named through its access), the reach grants scoped to the whole account
   *  (`scope.kind === 'adapter'`), and its UNSETTLED outbox proposals (any
   *  state that is not terminal — `unknown` included: a lost outcome still
   *  needs its adapter to be reconciled). Agent groups are NOT counted — a
   *  group references agent sessions, never a channel account. */
  function referencesOf(adapterId) {
    const refs = [];
    const seenGrant = new Set();
    for (const en of Object.values(store.index.live())) {   // B-f32b: a read-only scan of the live rows (was a whole-index copy)
      if (!en) continue;
      if (en.adapterId === adapterId) {
        for (const r of convGrainOf(en).access) refs.push({ kind: 'access', key: en.key, convId: en.id, title: conversationName(en.adapterId, en.id) || en.id, scope: 'conversation', principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null } });
      }
      for (const g of en.reachEntries || []) {
        if (!g || !g.scope || g.scope.kind !== 'adapter' || g.scope.id !== adapterId) continue;
        const gid = ACL.grantId(g);
        if (seenGrant.has(gid)) continue;
        seenGrant.add(gid);
        refs.push({ kind: 'reach', grantId: gid, principal: { kind: g.principal.kind, id: g.principal.id, name: g.principal.name || null }, level: g.level, origin: g.origin });
      }
    }
    // 2026-09-26: the ACCOUNT and PATTERN grains, and the account-scope grants
    const acct = accountGrainOf(adapterId);
    for (const r of acct ? F.grainOf(acct).access : []) refs.push({ kind: 'access', key: adapterId, scope: 'account', principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null } });
    for (const pa of patternsOf(adapterId)) for (const r of F.grainOf(pa).access) refs.push({ kind: 'access', key: pa.id, scope: 'pattern', title: F.patternSummary(pa.pattern), principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null } });
    for (const g of store.index.table('accountGrants') || []) {
      if (!g || !g.scope || g.scope.kind !== 'adapter' || g.scope.id !== adapterId) continue;
      const gid = ACL.grantId(g);
      if (seenGrant.has(gid)) continue;
      seenGrant.add(gid);
      refs.push({ kind: 'reach', grantId: gid, principal: { kind: g.principal.kind, id: g.principal.id, name: g.principal.name || null }, level: g.level, origin: g.origin });
    }
    for (const p of Object.values(store.outbox.snapshot().proposals)) {
      if (p && p.adapterId === adapterId && !P.isTerminal(p.state)) refs.push({ kind: 'outbox', id: p.id, key: p.key, state: p.state });
    }
    return refs;
  }
  /** REMOVE an account (r4 §8.1 #5): refused `409 account-referenced` BY
   *  NAME while anything still points at it (`refs`, each named — the mounts'
   *  "a credential with submounts cannot be removed"); otherwise its live
   *  entry, pending windows, running flow, index rows and record go —
   *  through the two serialized doors (its message logs stay on disk:
   *  archive-never-destroy). The built-in Agents row is not removable. */
  async function remove(adapterId) {
    const rec = recordOrThrow(adapterId);
    if (rec.builtin) throw httpErr(400, 'builtin', `${rec.label || rec.id} is built in and cannot be removed`);
    const refs = referencesOf(rec.id);
    if (refs.length) {
      const n = (k) => refs.filter((r) => r.kind === k).length;
      throw httpErr(409, 'account-referenced', `cannot remove ${rec.label || rec.id} — it is still referenced (${[['access', 'access grant'], ['reach', 'reach grant'], ['outbox', 'outbox proposal']].filter(([k]) => n(k)).map(([k, w]) => `${n(k)} ${w}${n(k) > 1 ? 's' : ''}`).join(', ')}); release them first — Disconnect only drops the token and keeps them`, { refs });
    }
    const running = flows.runningFor(rec.id);
    if (running) { flows.cancel(running.flowId, 'cancelled'); pendingFlows.delete(running.flowId); }
    await retractFailure(rec);
    await removeRecord(rec);
    log.log(`[channels] ${rec.id}: removed`);
    notify([]);
    return { ok: true, removed: true, id: rec.id };
  }
  /** Remove ONE account: its live entry, its pending wake windows, its index
   *  rows and its adapter record — through the two serialized doors, nothing
   *  else's. */
  async function removeRecord(rec) {
    dropLive(rec.id, 'removed');
    paceCarry.delete(rec.id);   // R5: nothing left to charge
    retractUnsaved(rec);   // R5 verify r6: the unsaved-sign-in item goes with the record (the disk holds no record to lag behind)
    // every wake window of the account: its conversations', and (R4, lane R2
    // verify A9b) its account / rule scope digests — a surviving scope timer
    // would fire into a grain that is gone
    const patIds = new Set(patternsOf(rec.id).map((pa) => pa.id));
    for (const [key, w] of [...wakeTimers.entries()]) if (key.startsWith(rec.id + '/') || key.startsWith(`scope:acct:${rec.id}|`) || (key.startsWith('scope:pat:') && patIds.has(key.slice(10, key.lastIndexOf('|'))))) { clearTimeout(w.timer); wakeTimers.delete(key); }
    await store.index.update((ix) => {
      for (const k of Object.keys(ix.conversations)) if (ix.conversations[k] && ix.conversations[k].adapterId === rec.id) delete ix.conversations[k];
      if (ix.accountAssignments) delete ix.accountAssignments[rec.id];
      if (ix.patternAssignments) for (const [id, pa] of Object.entries(ix.patternAssignments)) if (pa && pa.adapterId === rec.id) delete ix.patternAssignments[id];
      if (Array.isArray(ix.accountGrants)) ix.accountGrants = ix.accountGrants.filter((g) => !(g && g.scope && g.scope.id === rec.id));
    });
    await store.adapters.update((a) => { const i = a.adapters.indexOf(rec); if (i >= 0) a.adapters.splice(i, 1); });
    await purgeIfDeclared(rec);
  }
  /** design 012: THE SETUP REPORT an adapter writes into its record's state (`state.setup.probes` — the first real
   *  install's answers, by name): a closed list of names, each value a short word, a boolean or a list of scope names. */
  const SETUP_PROBES = Object.freeze(['lastRead', 'sendMarker', 'userOnlyManifest', 'scopes', 'planLimited', 'historyTier']);
  function setupView(rec) {
    const s = rec && rec.state && rec.state.setup && typeof rec.state.setup === 'object' ? rec.state.setup : null;
    if (!s || !s.probes || typeof s.probes !== 'object') return null;
    const probes = {};
    for (const k of SETUP_PROBES) {
      const v = s.probes[k];
      if (typeof v === 'boolean') probes[k] = v;
      else if (typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v)) probes[k] = v;
      else if (Array.isArray(v)) probes[k] = v.filter((x) => typeof x === 'string' && /^[a-z][a-z0-9_.:-]{1,63}$/.test(x)).slice(0, 60);
    }
    return { probes, at: Number(s.at) || null };
  }
  /** design 012 (Slack S1, F5 / D12): an adapter whose `caps.retention` is `purge-on-remove` takes its LOCAL COPY with
   *  the account — the message logs (msgs/<id>/), the fetched files (attachments/<id>/), and every ENDED proposal of the
   *  account with its staged files (a live one refuses the removal by name first — referencesOf). Slack's Developer
   *  Policy: the data goes when the app does. Every other adapter keeps its logs (archive-never-destroy). */
  async function purgeIfDeclared(rec) {
    let c = null;
    try { c = registry.capsOf(rec.kind); } catch { c = null; }
    if (!c || c.retention !== 'purge-on-remove') return { purged: false };
    const ended = [];
    await store.outbox.update((ob) => { for (const [id, q] of Object.entries(ob.proposals)) if (q && q.adapterId === rec.id && P.isTerminal(q.state)) { ended.push(id); delete ob.proposals[id]; } });
    for (const id of ended) { try { OF.remove(store.dir, id); } catch { /* the sweep takes it */ } }
    const r = store.purgeAccount(rec.id);
    log.log(`[channels] ${rec.id}: removed with its local copy (${r.logs ? 'message logs' : 'no logs'}, ${r.files ? 'fetched files' : 'no files'}, ${ended.length} ended proposal(s)) — the adapter declares purge-on-remove`);
    try { store.audit({ kind: 'account', op: 'purge', id: rec.id, proposals: ended.length, at: now() }); } catch {}
    return { purged: true, proposals: ended.length };
  }
  /** DUPLICATE an account (r4 §8.1 #2, D4): a NEW record of the same type
   *  carrying EXACTLY `DUPLICATE_FIELDS` (the custom secret re-sealed), named
   *  `name` or '<label> (copy)', UNAUTHORIZED — it gets its own consent
   *  (Re-authorize). Never the token, the tracked list, assignments, reach
   *  grants, the log or its cursors (`DUPLICATE_NEVER`). */
  async function duplicate(adapterId, { name = null } = {}) {
    const src = recordOrThrow(adapterId);
    if (src.builtin) throw httpErr(400, 'builtin', `${src.label || src.id} is built in and cannot be duplicated`);
    const mod = connectableFor(src.kind);
    if (src.credentialKey === OWN_KEY) {
      const r = await inlineLegacyClient(src);
      if (!r.ok) throw httpErr(409, 'legacy-copy-failed', `${src.label || src.id}'s client could not be moved onto the account first: ${r.why}`);
    }
    const recs = adapterRecords();
    const dup = newRecord(mod, { id: mintAdapterId(mod.kind, recs), credentialKey: null });
    dup.label = cleanLabel(name) || `${src.label || src.id} (copy)`;
    for (const f of DUPLICATE_FIELDS) {
      switch (f.key) {
        case 'kind': dup.kind = src.kind; break;
        case 'client':
          dup.credentialKey = src.credentialKey || null;
          if (src.credential && src.credential.appSecretEnc) {
            let plain;
            try { plain = box.dec(src.credential.appSecretEnc); }
            catch { throw httpErr(409, 'custom-undecryptable', `${src.label || src.id}'s own client secret cannot be decrypted with ${KEY_FILE} — edit the account and enter it again before duplicating`); }
            dup.credential = { appId: String(src.credential.appId || ''), appSecretEnc: box.enc(plain) };   // RE-SEALED: a fresh nonce, never the original ciphertext
          }
          break;
        case 'filters': dup.options = { ...(src.options || {}) }; break;
        case 'pushClaim': if (dup.push && src.push && caps.PUSH_CLAIMS.includes(src.push.claimedExclusive)) dup.push.claimedExclusive = src.push.claimedExclusive; break;
        case 'senderLine': if (src.senderHonestyLine === true || src.senderHonestyLine === false) dup.senderHonestyLine = src.senderHonestyLine; break;
        default: throw new Error(`duplicate: DUPLICATE_FIELDS declares '${f.key}' with no implementation`);
      }
    }
    await store.adapters.update((a) => { a.adapters.push(dup); });
    log.log(`[channels] ${src.id}: duplicated as ${dup.id} (unauthorized — its own sign-in follows)`);
    notify([]);
    return { adapter: adapterView(dup) };
  }
  /** RENAME / THE CUSTOM SECRET (the Edit dialog's in-place saves): `label`;
   *  `credential {appId, appSecret}` replaces a custom client's SECRET in
   *  place when the id is the account's own — a different id (or a preset)
   *  is a client SWITCH, which is a re-authorization: `409
   *  client-change-needs-reauth` names the verb. */
  async function setLabel(adapterId, label) {
    const rec = recordOrThrow(adapterId);
    const v = cleanLabel(label);
    if (!v) throw httpErr(400, 'bad-request', 'a name is required');
    await store.adapters.update(() => { rec.label = v; });
    notify([]);
    return { ok: true, label: v };
  }
  async function setCustomSecret(adapterId, credential) {
    const rec = recordOrThrow(adapterId);
    const mod = connectableFor(rec.kind);
    const choice = { credentialKey: CUSTOM_KEY, credential: sealCustom(mod, credential) };
    if (!sameClient(rec, choice)) throw httpErr(409, 'client-change-needs-reauth', `switching ${rec.label || rec.id} to another client is a re-authorization — use Re-authorize with the new client (a token is bound to the client it was issued under)`);
    await store.adapters.update(() => { rec.credential = choice.credential; });
    notify([]);
    return { ok: true, customClient: customClientView(rec) };
  }
  /** THE OWNER-ONLY CONFIG (D3, the mounts' `GET /api/mounts/:id/config`
   *  rule — the Edit dialog prefills every parameter, the custom secret
   *  included): served to the owner's UI only, never broadcast, never
   *  logged, never an agent route. */
  function adapterConfig(adapterId) {
    const rec = recordOrThrow(adapterId);
    const mod = connectableFor(rec.kind);
    let client = null;
    if (rec.credential && typeof rec.credential === 'object') {
      let appSecret = null, undecryptable = false;
      if (rec.credential.appSecretEnc) { try { appSecret = box.dec(rec.credential.appSecretEnc); } catch { undecryptable = true; } }
      client = { appId: String(rec.credential.appId || ''), appSecret, undecryptable };
    }
    return {
      id: rec.id, kind: rec.kind, label: rec.label, credentialKey: rec.credentialKey || null,
      client, presets: presetsOf(mod), clientFields: clientFieldDecls(mod),
      options: viewOptions(mod, rec),
      push: rec.push ? { enabled: !!rec.push.enabled, claimedExclusive: rec.push.claimedExclusive || 'unknown' } : null,
      senderHonestyLine: rec.senderHonestyLine === true ? true : rec.senderHonestyLine === false ? false : null,
    };
  }

  // ── THE LEGACY `own` CLIENT, COPIED ONTO ITS ACCOUNT (r4 §2.6) ───────────
  // Reader-side and idempotent: a record still naming `own` (the retired
  // card's values) gets those values decrypted through the store's ONE
  // legacy reader (`.integrations-key`) and RE-SEALED under `.channels-key`
  // onto the record — and is stamped `custom` only AFTER that write landed
  // (a crash between the two leaves `own` + the copied client, which this
  // path serves and finishes). Run when a record is read (`adapterFor` /
  // `clientFor`) and by the `2026-09-channel-custom-client-inline`
  // migration. A failure is NAMED (logged once per cause) and the record
  // keeps `own`: it is retried, never silently re-pointed at a preset.
  const inlining = new Map();       // rec.id -> in-flight copy
  const inlineSaid = new Map();     // rec.id -> last failure logged
  function legacyCopyPlan(rec) {
    const mod = registry.vendor(rec.kind);
    const row = rowOf(mod);
    if (!row || !row.bindsPerAccount) return { ok: false, code: 'no-integration', why: `${rec.kind} has no account-bound integration row` };
    if (!integrations || typeof integrations.legacyOwnValues !== 'function') return { ok: false, code: 'no-store', why: 'no integration store to read the legacy values from' };
    const lv = integrations.legacyOwnValues(row.id);
    if (!lv.ok) return { ok: false, code: lv.code, why: lv.why };
    const cf = R.clientFieldsOf(row);
    return { ok: true, credential: { appId: String(lv.values[cf.idKey] || ''), appSecretEnc: box.enc(lv.values[cf.secretKey]) } };
  }
  function inlineLegacyClient(rec) {
    if (rec.credentialKey !== OWN_KEY) return Promise.resolve({ ok: true, already: true });
    if (inlining.has(rec.id)) return inlining.get(rec.id);
    const p = (async () => {
      if (!(rec.credential && rec.credential.appSecretEnc)) {
        const plan = legacyCopyPlan(rec);
        if (!plan.ok) {
          const line = `[channels] ${rec.id}: the saved client could not be moved onto the account (${plan.code}): ${plan.why} — the account keeps 'own' and it is retried`;
          if (inlineSaid.get(rec.id) !== line) { inlineSaid.set(rec.id, line); log.error(line); }
          return { ok: false, code: plan.code, why: plan.why };
        }
        await store.adapters.update(() => { rec.credential = plan.credential; });   // the client lands FIRST (atomic write)…
      }
      await store.adapters.update(() => { rec.credentialKey = CUSTOM_KEY; });     // …and only then the stamp
      inlineSaid.delete(rec.id);
      dropLive(rec.id, 'client moved onto the account');   // rebuilt under 'custom'
      log.log(`[channels] ${rec.id}: the saved client was moved onto the account (own → custom)`);
      if (!engineCtx.stopped) notify([]);
      return { ok: true, copied: true };
    })().finally(() => inlining.delete(rec.id));
    inlining.set(rec.id, p);
    return p;
  }
  function scheduleInline(rec) { if (rec && rec.credentialKey === OWN_KEY && !inlining.has(rec.id)) inlineLegacyClient(rec).catch((e) => log.error(`[channels] ${rec.id}: legacy client copy failed: ${(e && e.message) || e}`)); }
  /** The migration's entry (the shared runner is synchronous): every `own`
   *  record is PLANNED now (a failure is returned BY NAME so the run fails
   *  and is retried next boot), the copies run through the serialized door,
   *  and `write` settles when every one has landed. */
  function inlineLegacyClients() {
    const report = { copied: [], failed: [], skipped: 0 };
    const writes = [];
    for (const rec of adapterRecords().adapters) {
      if (rec.credentialKey !== OWN_KEY) { report.skipped++; continue; }
      const plan = rec.credential && rec.credential.appSecretEnc ? { ok: true } : legacyCopyPlan(rec);
      if (!plan.ok) { report.failed.push({ id: rec.id, code: plan.code, why: plan.why }); continue; }
      report.copied.push(rec.id);
      writes.push(inlineLegacyClient(rec));
    }
    return { ...report, write: Promise.all(writes) };
  }
  /** THE ONE-SHOT STAMP for records that predate the account model (the
   *  `2026-09-channel-credential-key` migration calls it): every real
   *  adapter record lacking `credentialKey` is stamped by
   *  `credentialKeyEvidence` — the client its own TOKEN names when this
   *  instance still offers it (`evidence:'token'`), else the integration's
   *  CURRENT pick (`evidence:'row-pick'`, what refreshed it until now) — on
   *  the LIVE records (visible to every adapter built from now on), written
   *  through the store's serialized door; every stamped row carries its
   *  evidence and the key the token named. A record whose token names
   *  nothing offered and whose integration resolves to nothing is left
   *  unstamped (it keeps following the row's pick, as before). Idempotent: a
   *  stamped record is `already`. */
  /** verify r6: a LEGACY record (pre-r5, no `identity`) is stamped ONCE from the evidence it holds — the token
   *  (Gmail's email, Lark's open_id) else its `auth.user` when that is an email — at boot, so a disconnect after the
   *  upgrade (which wipes auth.user) and a stranger's consent find the record bound to its holder, never nameless. */
  function stampIdentities() {
    const report = { stamped: [], skipped: [] };
    for (const rec of adapterRecords().adapters) {
      if (rec.identity && typeof rec.identity === 'object' && Object.keys(identityOf(rec.identity)).length) { report.skipped.push({ id: rec.id, why: 'already' }); continue; }
      const held = heldIdentity(rec, tokensFor(rec).read().token);
      if (!Object.keys(held).length) { report.skipped.push({ id: rec.id, why: 'no-evidence' }); continue; }
      rec.identity = { ...held };
      report.stamped.push({ id: rec.id, identity: held });
    }
    const write = report.stamped.length ? saveAdapters() : Promise.resolve();
    write.catch((err) => log.error(`[channels] identity stamp write failed (the live records carry it; the next adapters write persists it): ${(err && err.message) || err}`));
    // verify r7: what the stamp did is SAID — a record it cannot stamp is named, never stamped with a guess (it holds
    // no token and its auth.user is not an address; it takes its next consent, the recorded r6 residual)
    const unstamped = report.skipped.filter((s) => s.why === 'no-evidence').map((s) => s.id);
    if (report.stamped.length || unstamped.length) log.log(`[channels] identity stamp: ${report.stamped.length} legacy record(s) stamped from the token they hold (${report.stamped.map((s) => s.id).join(', ') || 'none'}); ${unstamped.length} left unstamped — no token and no address in auth.user (${unstamped.join(', ') || 'none'}); an unstamped record is bound by its next consent`);
    return { ...report, write };
  }
  function stampCredentialKeys() {
    const report = { stamped: [], skipped: [] };
    for (const rec of adapterRecords().adapters) {
      if (typeof rec.credentialKey === 'string' && rec.credentialKey) { report.skipped.push({ id: rec.id, why: 'already' }); continue; }
      const mod = registry.vendor(rec.kind);
      if (!mod || !mod.integration) { report.skipped.push({ id: rec.id, why: 'no-integration' }); continue; }
      const ev = credentialKeyEvidence(rec, mod);
      if (!ev.key) { report.skipped.push({ id: rec.id, why: 'nothing-resolves', tokenKey: ev.tokenKey }); continue; }
      rec.credentialKey = ev.key;
      report.stamped.push({ id: rec.id, key: ev.key, evidence: ev.evidence, tokenKey: ev.tokenKey });
    }
    const write = report.stamped.length ? saveAdapters() : Promise.resolve();
    write.catch((err) => log.error(`[channels] credential-key stamp write failed (the live records carry it; the next adapters write persists it): ${(err && err.message) || err}`));
    return { ...report, write };
  }
  async function setEnabled(adapterId, enabled) {
    const rec = recordOrThrow(adapterId);
    await store.adapters.update(() => { rec.enabled = !!enabled; });
    // verify r4: a disabled account takes THE exit — its queued paced calls are aborted by name (18 × 20 units used to
    // finish, paced, after the owner disabled it), the pass in flight ends at its next step, the lane is disarmed with it
    if (!enabled) dropLive(rec.id, 'disabled');
    else if (engineCtx.timer) syncPushLanes().catch(() => {});
    notify([]);
    return { ok: true, enabled: !!enabled };
  }
  /** THE PER-CHANNEL HONESTY SWITCH (§9.5, P4): true / false / null (= follow
   *  the instance setting). An audit line records the change; the outbox
   *  repaints because every pending card's "a sender line will be appended"
   *  note follows the switch. */
  /** The ACCOUNT's sending policy (R4, B-6acc): `direct` | `review` | null
   *  (= the adapter's declared default). A conversation's own policy still
   *  wins for that conversation; a composed NEW message reads this one. */
  async function setAccountPolicy(adapterId, mode, by = 'user') {
    const rec = recordOrThrow(adapterId);
    if (mode !== null && !P.POLICY_MODES.includes(mode)) return { ok: false, code: 'bad-policy', error: `mode must be ${P.POLICY_MODES.join('|')} (or null to use the adapter's default)` };
    if (mode !== null && !P.policyModesOf(registry.capsOf(rec.kind)).includes(mode)) return { ok: false, code: 'bad-policy', why: 'mode-not-offered', error: `${vendorNameOf(rec)} does not allow the "${mode}" policy — every message on it waits for your approval` };
    const t = now();
    await store.adapters.update(() => { rec.policy = mode === null ? null : { mode, by, at: t }; });
    try { store.audit({ kind: 'policy', op: 'set', scope: { kind: 'adapter', id: adapterId }, mode, at: t, by }); } catch {}
    notify([], { full: true });
    return { ok: true, policy: policyFor(rec, null) };
  }
  async function setSenderHonesty(adapterId, value) {
    const rec = recordOrThrow(adapterId);
    const v = value === null || value === undefined ? null : !!value;
    await store.adapters.update(() => { rec.senderHonestyLine = v; });
    try { store.audit({ kind: 'policy', op: 'sender-honesty-line', adapterId, value: v, at: now(), by: 'user' }); } catch {}
    notify([]);
    notifyOutbox([]);
    return { ok: true, senderHonestyLine: { record: v, effective: honestyLineFor(rec) } };
  }
  /** Per-record options the adapter DECLARES (`OPTIONS`): a key it did not
   *  declare is refused by name; `''` restores the declared default. A
   *  change re-runs discovery (the include query decides what a
   *  conversation is). */
  async function setOptions(adapterId, patch) {
    const rec = recordOrThrow(adapterId);
    const mod = registry.vendor(rec.kind);
    const decls = (mod && mod.OPTIONS) || [];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { const err = new Error('options must be an object'); err.status = 400; err.code = 'bad-request'; throw err; }
    const next = { ...(rec.options || {}) };
    for (const [k, raw] of Object.entries(patch)) {
      const d = decls.find((o) => o.key === k);
      if (!d) { const err = new Error(`'${k}' is not an option of ${rec.label || rec.id} (declared: ${decls.map((o) => o.key).join(', ') || 'none'})`); err.status = 400; err.code = 'unknown-option'; throw err; }
      if (raw === null || raw === undefined) continue;
      if (typeof raw !== 'string') { const err = new Error(`'${k}' must be a string`); err.status = 400; err.code = 'bad-request'; throw err; }
      const v = raw.trim();
      if (v.length > (d.maxLength || 500)) { const err = new Error(`'${k}' is longer than ${d.maxLength || 500} characters`); err.status = 400; err.code = 'bad-request'; throw err; }
      const val = v || (d.default !== undefined ? d.default : '');
      if (Array.isArray(d.choices) && d.choices.length && !d.choices.includes(val)) { const err = new Error(`'${k}' must be one of ${d.choices.join(', ')} (got '${val}')`); err.status = 400; err.code = 'bad-request'; throw err; }
      next[k] = val;
    }
    const changedKeys = Object.keys(patch).filter((k) => next[k] !== (rec.options || {})[k]);
    const rebuild = changedKeys.some((k) => { const d = decls.find((o) => o.key === k); return d && d.rebuild; });
    // `relive`: an option the PUSH LANE reads (Gmail's topic / subscription)
    // restarts the lane alone — single-use, a fresh arm — never the adapter.
    const relive = !rebuild && changedKeys.some((k) => { const d = decls.find((o) => o.key === k); return d && d.relive; });
    await store.adapters.update(() => { rec.options = next; });
    // An option the adapter reads at CONSTRUCTION (Lark's brand = every host)
    // rebuilds the live instance; one that is read live (Gmail's query) keeps
    // it — the store owns every cursor, so a rebuild loses nothing durable.
    if (rebuild) dropLive(rec.id, 'options changed');
    else if (relive) { const e = live.get(rec.id); if (e) disarmPush(e, 'push options changed'); }
    notify([]);
    if (rec.enabled !== false) pass(rec.id, { force: true }).catch(() => {});
    if (engineCtx.timer) syncPushLanes().catch(() => {});
    return { ok: true, options: { ...next } };
  }

  return {
    clientFor, resolverFor, credentialFactsFor, credentialFacts, offeredCredentials, defaultCredentialKey, credentialLabelFor, connectableFor,
    newRecord, mountClientsFor, viewOptions, startOAuth, oauthStatus, consentLandingOf, oauthLanding, oauthCallback, connect, reauthorize,
    recordOrThrow, safeFlow, finishAuth, narrowAuth, oauthNarrow, cancelAuth, onAuthDone, disconnect, referencesOf, remove, setupView, duplicate,
    setLabel, setCustomSecret, adapterConfig, inlineLegacyClient, scheduleInline, inlineLegacyClients, stampIdentities, stampCredentialKeys,
    setEnabled, setAccountPolicy, setSenderHonesty, setOptions,
  };
}

module.exports = { create };
